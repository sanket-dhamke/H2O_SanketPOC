import test from "node:test";
import assert from "node:assert/strict";
import { phoneTail, phoneOtpReady, sendPhoneCode } from "../src/phoneOtp.js";

test("a phone tail is the last four digits", () => {
  assert.equal(phoneTail("99999 00001"), "0001");
  assert.equal(phoneTail(""), "");
  assert.equal(phoneTail("12"), "");
});

test("phone codes stay off until a sender is configured", () => {
  assert.equal(phoneOtpReady(), false);
});

test("a failed send never echoes the code", async () => {
  const secret = "654321";
  const result = await sendPhoneCode({ toPhone: "9777700001", code: secret });
  assert.equal(result.delivered, false);
  assert.equal(result.reason, "not_configured");
  assert.equal(result.phoneTail, "0001");
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal("code" in result, false);
});
