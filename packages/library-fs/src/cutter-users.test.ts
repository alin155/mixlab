import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  approveCutterUser,
  createCutterLoginApplication,
  disableCutterUser,
  ensureCutterSessionForDevice,
  listCutterUsers,
  validateCutterSession
} from "./cutter-users.ts";

async function makeRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "mixlab-cutter-users-"));
}

function storePath(root: string): string {
  return path.join(root, ".mixlab-library", "cutter-users", "users.json");
}

async function writeRawStore(root: string, json: string): Promise<void> {
  await mkdir(path.dirname(storePath(root)), { recursive: true });
  await writeFile(storePath(root), json, "utf8");
}

test("creates pending login application and approves it into a reusable session", async () => {
  const root = await makeRoot();
  const application = await createCutterLoginApplication(root, {
    username: "小王",
    device_id: "device-1",
    device_name: "Allen Mac",
    now: "2026-05-02T10:00:00.000Z"
  });

  assert.equal(application.status, "pending");
  assert.equal((await listCutterUsers(root)).users.length, 1);

  const approved = await approveCutterUser(root, {
    user_id: application.user_id,
    now: "2026-05-02T10:01:00.000Z"
  });

  assert.equal(approved.status, "approved");
  assert.equal(approved.session.user_id, application.user_id);

  const session = await validateCutterSession(root, {
    device_id: "device-1",
    session_token: approved.session.session_token,
    now: "2026-05-02T10:02:00.000Z"
  });

  assert.equal(session.ok, true);
  assert.equal(session.user?.username, "小王");
});

test("approved login applications can recover their device session", async () => {
  const root = await makeRoot();
  const application = await createCutterLoginApplication(root, {
    username: "小王",
    device_id: "device-1",
    device_name: "Allen Mac",
    now: "2026-05-02T10:00:00.000Z"
  });
  const approved = await approveCutterUser(root, {
    user_id: application.user_id,
    now: "2026-05-02T10:01:00.000Z"
  });

  const recovered = await ensureCutterSessionForDevice(root, {
    user_id: application.user_id,
    device_id: "device-1",
    now: "2026-05-02T10:02:00.000Z"
  });

  assert.equal(recovered.session_token, approved.session.session_token);
  assert.equal(recovered.last_seen_at, "2026-05-02T10:02:00.000Z");
  assert.deepEqual(
    await validateCutterSession(root, {
      device_id: "device-1",
      session_token: recovered.session_token,
      now: "2026-05-02T10:03:00.000Z"
    }),
    { ok: true, user: { ...(await listCutterUsers(root)).users[0] } }
  );
});

test("disabled users cannot keep using existing sessions", async () => {
  const root = await makeRoot();
  const application = await createCutterLoginApplication(root, {
    username: "小李",
    device_id: "device-2",
    device_name: "Windows Workstation",
    now: "2026-05-02T10:00:00.000Z"
  });
  const approved = await approveCutterUser(root, {
    user_id: application.user_id,
    now: "2026-05-02T10:01:00.000Z"
  });

  await disableCutterUser(root, {
    user_id: application.user_id,
    now: "2026-05-02T10:03:00.000Z"
  });

  const session = await validateCutterSession(root, {
    device_id: "device-2",
    session_token: approved.session.session_token,
    now: "2026-05-02T10:04:00.000Z"
  });

  assert.equal(session.ok, false);
  assert.equal(session.reason, "登录凭证无效");
  const store = JSON.parse(await readFile(storePath(root), "utf8")) as {
    sessions: unknown[];
  };
  assert.equal(store.sessions.length, 0);
});

test("malformed JSON throws Chinese error and does not reset store", async () => {
  const root = await makeRoot();
  const malformed = "{ 这不是 json";
  await writeRawStore(root, malformed);

  await assert.rejects(
    () => listCutterUsers(root),
    /剪辑师用户存储文件格式错误/
  );
  await assert.rejects(
    () =>
      createCutterLoginApplication(root, {
        username: "小张",
        device_id: "device-3",
        device_name: "MacBook",
        now: "2026-05-02T10:05:00.000Z"
      }),
    /剪辑师用户存储文件格式错误/
  );
  assert.equal(await readFile(storePath(root), "utf8"), malformed);
});

test("invalid schema and duplicate identities throw Chinese validation errors", async () => {
  const root = await makeRoot();
  await writeRawStore(
    root,
    `${JSON.stringify({
      schema_version: "2.0",
      users: [],
      sessions: []
    })}\n`
  );
  await assert.rejects(() => listCutterUsers(root), /剪辑师用户存储数据无效/);

  await writeRawStore(
    root,
    `${JSON.stringify({
      schema_version: "1.0",
      users: [
        {
          user_id: "CU000001",
          username: "小陈",
          display_name: "小陈",
          status: "approved",
          applied_at: "2026-05-02T10:00:00.000Z",
          approved_at: "2026-05-02T10:01:00.000Z",
          rejected_at: "",
          disabled_at: "",
          last_login_at: "2026-05-02T10:01:00.000Z",
          last_used_at: "",
          note: "",
          devices: [
            {
              device_id: "device-4",
              device_name: "Mac",
              status: "active",
              first_seen_at: "2026-05-02T10:00:00.000Z",
              last_login_at: "2026-05-02T10:01:00.000Z"
            }
          ]
        },
        {
          user_id: "CU000001",
          username: "小周",
          display_name: "小周",
          status: "pending",
          applied_at: "2026-05-02T10:02:00.000Z",
          approved_at: "",
          rejected_at: "",
          disabled_at: "",
          last_login_at: "",
          last_used_at: "",
          note: "",
          devices: [
            {
              device_id: "device-5",
              device_name: "Windows",
              status: "active",
              first_seen_at: "2026-05-02T10:02:00.000Z",
              last_login_at: ""
            }
          ]
        }
      ],
      sessions: [
        {
          user_id: "CU000001",
          device_id: "device-4",
          session_token: "token-1",
          created_at: "2026-05-02T10:01:00.000Z",
          last_seen_at: "2026-05-02T10:01:00.000Z"
        },
        {
          user_id: "CU000001",
          device_id: "device-4",
          session_token: "token-1",
          created_at: "2026-05-02T10:01:00.000Z",
          last_seen_at: "2026-05-02T10:01:00.000Z"
        }
      ]
    })}\n`
  );
  await assert.rejects(() => listCutterUsers(root), /剪辑师用户存储数据无效/);

  await writeRawStore(
    root,
    `${JSON.stringify({
      schema_version: "1.0",
      users: [
        {
          user_id: "CU000001",
          username: "小陈",
          display_name: "小陈",
          status: "approved",
          applied_at: "2026-05-02T10:00:00.000Z",
          approved_at: "2026-05-02T10:01:00.000Z",
          rejected_at: "",
          disabled_at: "",
          last_login_at: "2026-05-02T10:01:00.000Z",
          last_used_at: "",
          note: "",
          devices: [
            {
              device_id: "device-4",
              device_name: "Mac",
              status: "active",
              first_seen_at: "2026-05-02T10:00:00.000Z",
              last_login_at: "2026-05-02T10:01:00.000Z"
            }
          ]
        }
      ],
      sessions: [
        {
          user_id: "CU000001",
          device_id: "device-4",
          session_token: "token-1",
          created_at: "2026-05-02T10:01:00.000Z",
          last_seen_at: "2026-05-02T10:01:00.000Z"
        },
        {
          user_id: "CU000001",
          device_id: "device-4",
          session_token: "token-1",
          created_at: "2026-05-02T10:02:00.000Z",
          last_seen_at: "2026-05-02T10:02:00.000Z"
        }
      ]
    })}\n`
  );
  await assert.rejects(() => listCutterUsers(root), /剪辑师用户存储数据无效/);
});

test("sparse large existing user ids allocate next id safely", async () => {
  const root = await makeRoot();
  await writeRawStore(
    root,
    `${JSON.stringify({
      schema_version: "1.0",
      users: [
        {
          user_id: "CU000002",
          username: "小赵",
          display_name: "小赵",
          status: "pending",
          applied_at: "2026-05-02T10:00:00.000Z",
          approved_at: "",
          rejected_at: "",
          disabled_at: "",
          last_login_at: "",
          last_used_at: "",
          note: "",
          devices: [
            {
              device_id: "device-6",
              device_name: "Mac",
              status: "active",
              first_seen_at: "2026-05-02T10:00:00.000Z",
              last_login_at: ""
            }
          ]
        },
        {
          user_id: "CU999999999999999999999999",
          username: "小钱",
          display_name: "小钱",
          status: "disabled",
          applied_at: "2026-05-02T10:00:00.000Z",
          approved_at: "",
          rejected_at: "",
          disabled_at: "2026-05-02T10:03:00.000Z",
          last_login_at: "",
          last_used_at: "",
          note: "",
          devices: [
            {
              device_id: "device-7",
              device_name: "Windows",
              status: "active",
              first_seen_at: "2026-05-02T10:00:00.000Z",
              last_login_at: ""
            }
          ]
        }
      ],
      sessions: []
    })}\n`
  );

  const created = await createCutterLoginApplication(root, {
    username: "小孙",
    device_id: "device-8",
    device_name: "Linux",
    now: "2026-05-02T10:04:00.000Z"
  });

  assert.equal(created.user_id, "CU1000000000000000000000000");
});

test("same username only reuses the same device application", async () => {
  const root = await makeRoot();
  const first = await createCutterLoginApplication(root, {
    username: " 小吴 ",
    device_id: "device-9",
    device_name: "Mac",
    now: "2026-05-02T10:00:00.000Z"
  });
  const repeated = await createCutterLoginApplication(root, {
    username: "小吴",
    device_id: "device-9",
    device_name: "Mac Renamed",
    now: "2026-05-02T10:01:00.000Z"
  });
  const secondDevice = await createCutterLoginApplication(root, {
    username: "小吴",
    device_id: "device-10",
    device_name: "Windows",
    now: "2026-05-02T10:02:00.000Z"
  });

  assert.equal(repeated.user_id, first.user_id);
  assert.notEqual(secondDevice.user_id, first.user_id);
  assert.equal(secondDevice.status, "pending");

  const users = (await listCutterUsers(root)).users;
  assert.equal(users.length, 2);
  assert.deepEqual(
    users.map((user) => user.devices.map((device) => device.device_id)),
    [["device-9"], ["device-10"]]
  );
});

test("login applications persist device audit metadata without using IP as identity", async () => {
  const root = await makeRoot();
  const first = await createCutterLoginApplication(root, {
    username: "小吴",
    device_id: "device-audit",
    device_name: "Mac 剪辑端 · Safari",
    now: "2026-05-02T10:00:00.000Z",
    ip_address: "192.168.31.10",
    user_agent: "Safari/605.1.15"
  } as any);

  assert.equal((first.devices[0] as any)?.last_ip_address, "192.168.31.10");
  assert.equal((first.devices[0] as any)?.user_agent, "Safari/605.1.15");

  const repeated = await createCutterLoginApplication(root, {
    username: "小吴",
    device_id: "device-audit",
    device_name: "Mac 剪辑端 · Safari",
    now: "2026-05-02T10:01:00.000Z",
    ip_address: "10.0.0.8",
    user_agent: "Safari/605.1.15"
  } as any);

  assert.equal(repeated.user_id, first.user_id);
  const users = (await listCutterUsers(root)).users;
  assert.equal(users.length, 1);
  assert.equal((users[0]?.devices[0] as any)?.last_ip_address, "10.0.0.8");
  assert.equal((users[0]?.devices[0] as any)?.device_id, "device-audit");
});

test("approved username on a new device creates a fresh pending application", async () => {
  const root = await makeRoot();
  const approvedDevice = await createCutterLoginApplication(root, {
    username: "小周",
    device_id: "approved-device",
    device_name: "Mac",
    now: "2026-05-02T10:00:00.000Z"
  });
  await approveCutterUser(root, {
    user_id: approvedDevice.user_id,
    now: "2026-05-02T10:01:00.000Z"
  });

  const newDevice = await createCutterLoginApplication(root, {
    username: "小周",
    device_id: "unreviewed-device",
    device_name: "Windows",
    now: "2026-05-02T10:02:00.000Z"
  });

  assert.notEqual(newDevice.user_id, approvedDevice.user_id);
  assert.equal(newDevice.status, "pending");
  assert.deepEqual(
    (await listCutterUsers(root)).users.map((user) => ({
      user_id: user.user_id,
      status: user.status,
      devices: user.devices.map((device) => device.device_id)
    })),
    [
      {
        user_id: approvedDevice.user_id,
        status: "approved",
        devices: ["approved-device"]
      },
      {
        user_id: newDevice.user_id,
        status: "pending",
        devices: ["unreviewed-device"]
      }
    ]
  );
});

test("approving non-pending user throws Chinese lifecycle error", async () => {
  const root = await makeRoot();
  const application = await createCutterLoginApplication(root, {
    username: "小郑",
    device_id: "device-11",
    device_name: "Mac",
    now: "2026-05-02T10:00:00.000Z"
  });
  await approveCutterUser(root, {
    user_id: application.user_id,
    now: "2026-05-02T10:01:00.000Z"
  });

  await assert.rejects(
    () =>
      approveCutterUser(root, {
        user_id: application.user_id,
        now: "2026-05-02T10:02:00.000Z"
      }),
    /只有待审核剪辑师用户可以通过审核/
  );

  const disabled = await createCutterLoginApplication(root, {
    username: "小王",
    device_id: "device-12",
    device_name: "Windows",
    now: "2026-05-02T10:03:00.000Z"
  });
  await disableCutterUser(root, {
    user_id: disabled.user_id,
    now: "2026-05-02T10:04:00.000Z"
  });
  await assert.rejects(
    () =>
      approveCutterUser(root, {
        user_id: disabled.user_id,
        now: "2026-05-02T10:05:00.000Z"
      }),
    /只有待审核剪辑师用户可以通过审核/
  );

  await writeRawStore(
    root,
    `${JSON.stringify({
      schema_version: "1.0",
      users: [
        {
          user_id: "CU000001",
          username: "小郑",
          display_name: "小郑",
          status: "approved",
          applied_at: "2026-05-02T10:00:00.000Z",
          approved_at: "2026-05-02T10:01:00.000Z",
          rejected_at: "",
          disabled_at: "",
          last_login_at: "2026-05-02T10:01:00.000Z",
          last_used_at: "",
          note: "",
          devices: [
            {
              device_id: "device-11",
              device_name: "Mac",
              status: "active",
              first_seen_at: "2026-05-02T10:00:00.000Z",
              last_login_at: "2026-05-02T10:01:00.000Z"
            }
          ]
        },
        {
          user_id: "CU000002",
          username: "小王",
          display_name: "小王",
          status: "disabled",
          applied_at: "2026-05-02T10:03:00.000Z",
          approved_at: "",
          rejected_at: "",
          disabled_at: "2026-05-02T10:04:00.000Z",
          last_login_at: "",
          last_used_at: "",
          note: "",
          devices: [
            {
              device_id: "device-12",
              device_name: "Windows",
              status: "active",
              first_seen_at: "2026-05-02T10:03:00.000Z",
              last_login_at: ""
            }
          ]
        },
        {
          user_id: "CU000003",
          username: "小刘",
          display_name: "小刘",
          status: "rejected",
          applied_at: "2026-05-02T10:06:00.000Z",
          approved_at: "",
          rejected_at: "2026-05-02T10:07:00.000Z",
          disabled_at: "",
          last_login_at: "",
          last_used_at: "",
          note: "",
          devices: [
            {
              device_id: "device-13",
              device_name: "Linux",
              status: "active",
              first_seen_at: "2026-05-02T10:06:00.000Z",
              last_login_at: ""
            }
          ]
        }
      ],
      sessions: [
        {
          user_id: "CU000001",
          device_id: "device-11",
          session_token: "token-1",
          created_at: "2026-05-02T10:01:00.000Z",
          last_seen_at: "2026-05-02T10:01:00.000Z"
        }
      ]
    })}\n`
  );
  await assert.rejects(
    () =>
      approveCutterUser(root, {
        user_id: "CU000003",
        now: "2026-05-02T10:08:00.000Z"
      }),
    /只有待审核剪辑师用户可以通过审核/
  );
});

test("invalid and pending sessions return expected Chinese reasons", async () => {
  const root = await makeRoot();
  const application = await createCutterLoginApplication(root, {
    username: "小冯",
    device_id: "device-12",
    device_name: "Mac",
    now: "2026-05-02T10:00:00.000Z"
  });

  assert.deepEqual(
    await validateCutterSession(root, {
      device_id: "device-12",
      session_token: "missing-token",
      now: "2026-05-02T10:01:00.000Z"
    }),
    { ok: false, reason: "登录凭证无效" }
  );

  await writeRawStore(
    root,
    `${JSON.stringify({
      schema_version: "1.0",
      users: [application],
      sessions: [
        {
          user_id: application.user_id,
          device_id: "device-12",
          session_token: "pending-token",
          created_at: "2026-05-02T10:01:00.000Z",
          last_seen_at: "2026-05-02T10:01:00.000Z"
        }
      ]
    })}\n`
  );

  assert.deepEqual(
    await validateCutterSession(root, {
      device_id: "device-12",
      session_token: "pending-token",
      now: "2026-05-02T10:02:00.000Z"
    }),
    { ok: false, reason: "用户尚未通过审核" }
  );
});

test("concurrent login applications persist all distinct users with unique ids", async () => {
  const root = await makeRoot();
  const applications = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      createCutterLoginApplication(root, {
        username: `剪辑师-${index}`,
        device_id: `concurrent-device-${index}`,
        device_name: `Device ${index}`,
        now: "2026-05-02T11:00:00.000Z"
      })
    )
  );

  const returnedIds = new Set(applications.map((application) => application.user_id));
  assert.equal(returnedIds.size, 20);

  const users = (await listCutterUsers(root)).users;
  const persistedIds = new Set(users.map((user) => user.user_id));
  assert.equal(users.length, 20);
  assert.equal(persistedIds.size, 20);
  assert.deepEqual([...persistedIds].sort(), [
    "CU000001",
    "CU000002",
    "CU000003",
    "CU000004",
    "CU000005",
    "CU000006",
    "CU000007",
    "CU000008",
    "CU000009",
    "CU000010",
    "CU000011",
    "CU000012",
    "CU000013",
    "CU000014",
    "CU000015",
    "CU000016",
    "CU000017",
    "CU000018",
    "CU000019",
    "CU000020"
  ]);
});

test("validate after disable cannot resurrect revoked session", async () => {
  const root = await makeRoot();
  const application = await createCutterLoginApplication(root, {
    username: "小高",
    device_id: "race-device-1",
    device_name: "Mac",
    now: "2026-05-02T11:10:00.000Z"
  });
  const approved = await approveCutterUser(root, {
    user_id: application.user_id,
    now: "2026-05-02T11:11:00.000Z"
  });

  await disableCutterUser(root, {
    user_id: application.user_id,
    now: "2026-05-02T11:12:00.000Z"
  });

  assert.deepEqual(
    await validateCutterSession(root, {
      device_id: "race-device-1",
      session_token: approved.session.session_token,
      now: "2026-05-02T11:13:00.000Z"
    }),
    { ok: false, reason: "登录凭证无效" }
  );

  const store = JSON.parse(await readFile(storePath(root), "utf8")) as {
    sessions: { user_id: string }[];
    users: { user_id: string; status: string }[];
  };
  assert.equal(
    store.sessions.some((session) => session.user_id === application.user_id),
    false
  );
  assert.equal(
    store.users.find((user) => user.user_id === application.user_id)?.status,
    "disabled"
  );
});

test("same username and device after disabled or rejected creates fresh pending application", async () => {
  const root = await makeRoot();
  const first = await createCutterLoginApplication(root, {
    username: "小贺",
    device_id: "device-after-disabled",
    device_name: "Mac",
    now: "2026-05-02T11:20:00.000Z"
  });
  await disableCutterUser(root, {
    user_id: first.user_id,
    now: "2026-05-02T11:21:00.000Z"
  });

  const second = await createCutterLoginApplication(root, {
    username: "小贺",
    device_id: "device-after-disabled",
    device_name: "Mac",
    now: "2026-05-02T11:22:00.000Z"
  });

  assert.notEqual(second.user_id, first.user_id);
  assert.equal(second.status, "pending");
  assert.equal(second.devices[0]?.device_id, "device-after-disabled");
  assert.equal((await listCutterUsers(root)).users.length, 2);

  const rejectedRoot = await makeRoot();
  await writeRawStore(
    rejectedRoot,
    `${JSON.stringify({
      schema_version: "1.0",
      users: [
        {
          user_id: "CU000001",
          username: "小贺",
          display_name: "小贺",
          status: "rejected",
          applied_at: "2026-05-02T11:30:00.000Z",
          approved_at: "",
          rejected_at: "2026-05-02T11:31:00.000Z",
          disabled_at: "",
          last_login_at: "",
          last_used_at: "",
          note: "",
          devices: [
            {
              device_id: "device-after-rejected",
              device_name: "Mac",
              status: "active",
              first_seen_at: "2026-05-02T11:30:00.000Z",
              last_login_at: ""
            }
          ]
        }
      ],
      sessions: []
    })}\n`
  );

  const afterRejected = await createCutterLoginApplication(rejectedRoot, {
    username: "小贺",
    device_id: "device-after-rejected",
    device_name: "Mac",
    now: "2026-05-02T11:32:00.000Z"
  });

  assert.equal(afterRejected.user_id, "CU000002");
  assert.equal(afterRejected.status, "pending");
  assert.equal((await listCutterUsers(rejectedRoot)).users.length, 2);
});
