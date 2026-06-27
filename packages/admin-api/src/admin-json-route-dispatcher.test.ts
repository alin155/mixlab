import assert from "node:assert/strict";
import test from "node:test";
import { apiOk } from "./admin-route-adapter.ts";
import { dispatchAdminJsonRoutes } from "./admin-json-route-dispatcher.ts";

test("admin json route dispatcher returns the first handled route", async () => {
  const events: string[] = [];
  const result = await dispatchAdminJsonRoutes([
    async () => {
      events.push("first");
      return { handled: false };
    },
    async () => {
      events.push("second");
      return {
        handled: true,
        status_code: 200,
        body: apiOk({ route: "second" })
      };
    },
    async () => {
      events.push("third");
      return {
        handled: true,
        status_code: 200,
        body: apiOk({ route: "third" })
      };
    }
  ]);

  assert.deepEqual(events, ["first", "second"]);
  assert.equal(result.handled, true);
  if (result.handled) {
    assert.equal(result.status_code, 200);
    assert.deepEqual(result.body, apiOk({ route: "second" }));
  }
});

test("admin json route dispatcher reports unhandled when no routes match", async () => {
  const result = await dispatchAdminJsonRoutes([
    async () => ({ handled: false }),
    async () => ({ handled: false })
  ]);

  assert.deepEqual(result, { handled: false });
});
