import { test } from "node:test";
import assert from "node:assert/strict";
import { deliverOnce } from "../supabase/functions/send-weekly-digest/delivery";

test("concurrent attempts only submit one message after an atomic reservation", async () => {
  let reserved = false,
    sends = 0,
    accepted = 0;
  const reserve = async () => {
    if (reserved) return false;
    reserved = true;
    return true;
  };
  const send = async () => {
    sends++;
    return "id";
  };
  const mark = async () => {
    accepted++;
  };
  const result = await Promise.all([
    deliverOnce(reserve, send, mark),
    deliverOnce(reserve, send, mark),
  ]);
  assert.equal(sends, 1);
  assert.equal(accepted, 1);
  assert.equal(result.filter((r) => r.skipped).length, 1);
});
test("timeout or accepted-state write failure keeps the reservation and prevents resend", async () => {
  for (const failure of ["transport", "database"]) {
    let reserved = false,
      sends = 0;
    const reserve = async () => {
      if (reserved) return false;
      reserved = true;
      return true;
    };
    const send = async () => {
      sends++;
      if (failure === "transport") throw Error("uncertain");
      return "id";
    };
    const mark = async () => {
      throw Error("state unavailable");
    };
    await assert.rejects(() => deliverOnce(reserve, send, mark));
    assert.deepEqual(await deliverOnce(reserve, send, mark), { skipped: true });
    assert.equal(sends, 1);
  }
});
test("reservation failure fails closed before any provider call", async () => {
  let sends = 0;
  await assert.rejects(() =>
    deliverOnce(
      async () => {
        throw Error("database unavailable");
      },
      async () => {
        sends++;
        return null;
      },
      async () => {},
    ),
  );
  assert.equal(sends, 0);
});
