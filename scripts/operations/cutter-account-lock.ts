import {
  checkCutterAccountLockOwnerDead,
  inspectCutterAccountLock,
  readLocalCutterAccountBootIdentity,
  recoverCutterAccountLock
} from "../../packages/library-fs/src/cutter-account-lock.ts";

const [operation, root, fingerprint, confirmation] = process.argv.slice(2);

if (!operation || !root) {
  throw new Error(
    "用法：identity | inspect <root> | recover <root> <fingerprint> [--legacy-writers-stopped]"
  );
}

if (operation === "identity") {
  console.log(JSON.stringify(await readLocalCutterAccountBootIdentity(), null, 2));
} else if (operation === "inspect") {
  const state = await inspectCutterAccountLock(root);
  const ownerCheck =
    state.exists && state.owner ? await checkCutterAccountLockOwnerDead(state.owner) : null;
  console.log(
    JSON.stringify(
      {
        ...state,
        owner_check: ownerCheck
      },
      null,
      2
    )
  );
} else if (operation === "recover") {
  if (!fingerprint) {
    throw new Error("恢复账号锁需要先执行 inspect 并传入 fingerprint");
  }
  const result = await recoverCutterAccountLock(root, {
    fingerprint,
    legacy_writers_stopped: confirmation === "--legacy-writers-stopped"
  });
  console.log(JSON.stringify(result, null, 2));
} else {
  throw new Error("账号锁操作无效");
}
