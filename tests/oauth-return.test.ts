import { test } from "node:test";
import assert from "node:assert/strict";
import { consumeOAuthReturn } from "../src/auth/oauth-return";
test("OAuth credentials are removed synchronously, including incomplete callbacks", () => {
  for (const hash of ["#access_token=access&refresh_token=refresh&provider_token=provider", "#access_token=access", "#provider_token=provider"]) {
    const calls: unknown[][] = [];
    const result = consumeOAuthReturn({ hash, pathname: "/", search: "?view=archive" }, { replaceState: (...args) => calls.push(args) });
    assert.deepEqual(calls, [[null, "", "/?view=archive"]]);
    assert.deepEqual(result, hash.includes("refresh_token") ? { access_token: "access", refresh_token: "refresh" } : null);
  }
});
test("ordinary page fragments are retained", () => {
  assert.equal(consumeOAuthReturn({ hash: "#questions", pathname: "/", search: "" }, { replaceState: () => assert.fail("Unexpected URL change") }), null);
});
