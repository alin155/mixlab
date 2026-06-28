import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import { resolveUgosAuthFromEnv } from "./admin-docker-nas-ugos-auth.ts";

function jsonResponse(value: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}

test("UGOS auth helper can exchange username/password for a temporary query token", async () => {
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicPem = publicKey.export({ type: "spki", format: "pem" })
    .toString()
    .replace("BEGIN PUBLIC KEY", "BEGIN RSA PUBLIC KEY")
    .replace("END PUBLIC KEY", "END RSA PUBLIC KEY");
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    const parsed = new URL(String(url));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ path: parsed.pathname, body });

    if (parsed.pathname.endsWith("/ugreen/v1/verify/check")) {
      return jsonResponse({ code: 200, msg: "success", data: {} }, {
        "x-rsa-token": Buffer.from(publicPem, "utf8").toString("base64")
      });
    }

    if (parsed.pathname.endsWith("/ugreen/v1/verify/login")) {
      assert.equal(body.username, "user-a");
      assert.equal(typeof body.password, "string");
      assert.notEqual(body.password, "super-secret-password");
      return jsonResponse({
        code: 200,
        msg: "success",
        data: {
          api_token: "temporary-query-token"
        }
      });
    }

    return new Response("not found", { status: 404 });
  };

  const auth = await resolveUgosAuthFromEnv({
    env: {
      MIXLAB_UGOS_USERNAME: "user-a",
      MIXLAB_UGOS_PASSWORD: "super-secret-password"
    } as NodeJS.ProcessEnv,
    baseUrl: "http://192.168.1.27:9999",
    fetchImpl,
    timeout_ms: 1000
  });

  assert.equal(auth.query_token, "temporary-query-token");
  assert.equal(auth.inputs.username_password_present, true);
  assert.equal(auth.inputs.password_login_attempted, true);
  assert.equal(auth.inputs.password_login_succeeded, true);
  assert.equal(auth.inputs.password_login_code, "200");
  assert.equal(auth.inputs.password_login_message, "success");
  assert.equal(auth.inputs.password_login_token_present, true);
  assert.equal(auth.inputs.password_login_cookie_present, false);
  assert.equal(auth.inputs.query_token_present, true);
  assert.equal(calls.length, 2);
});

test("UGOS auth helper does not password-login when explicit auth is supplied", async () => {
  let called = false;
  const auth = await resolveUgosAuthFromEnv({
    env: {
      MIXLAB_UGOS_USERNAME: "user-a",
      MIXLAB_UGOS_PASSWORD: "super-secret-password",
      MIXLAB_UGOS_TOKEN: "already-authenticated"
    } as NodeJS.ProcessEnv,
    baseUrl: "http://192.168.1.27:9999",
    fetchImpl: (async () => {
      called = true;
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch
  });

  assert.equal(called, false);
  assert.equal(auth.query_token, "already-authenticated");
  assert.equal(auth.inputs.username_password_present, true);
  assert.equal(auth.inputs.password_login_attempted, false);
  assert.equal(auth.inputs.password_login_succeeded, false);
  assert.equal(auth.inputs.password_login_code, "");
  assert.equal(auth.inputs.password_login_message, "");
  assert.equal(auth.inputs.query_token_present, true);
});

test("UGOS auth helper falls back to password login when explicit token is blank", async () => {
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const fetchImpl: typeof fetch = async (url) => {
    const parsed = new URL(String(url));

    if (parsed.pathname.endsWith("/ugreen/v1/verify/check")) {
      return jsonResponse({ code: 200, msg: "success", data: {} }, {
        "x-rsa-token": Buffer.from(publicPem, "utf8").toString("base64")
      });
    }

    if (parsed.pathname.endsWith("/ugreen/v1/verify/login")) {
      return jsonResponse({
        code: 200,
        msg: "success",
        data: {
          api_token: "login-query-token"
        }
      });
    }

    return new Response("not found", { status: 404 });
  };

  const auth = await resolveUgosAuthFromEnv({
    env: {
      MIXLAB_UGOS_USERNAME: "user-a",
      MIXLAB_UGOS_PASSWORD: "super-secret-password",
      MIXLAB_UGOS_TOKEN: " "
    } as NodeJS.ProcessEnv,
    baseUrl: "http://192.168.1.27:9999",
    fetchImpl
  });

  assert.equal(auth.query_token, "login-query-token");
  assert.equal(auth.inputs.password_login_attempted, true);
  assert.equal(auth.inputs.password_login_succeeded, true);
  assert.equal(auth.inputs.query_token_present, true);
});
