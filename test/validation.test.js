import assert from "node:assert/strict";
import test from "node:test";
import { isValidCron, isValidTimezone, validateMessage } from "../src/validation.js";

test("validates cron expressions", () => {
  assert.equal(isValidCron("0 9 * * 1-5"), true);
  assert.equal(isValidCron("* * * * * *"), false);
  assert.equal(isValidCron("not a schedule"), false);
});

test("validates IANA timezones", () => {
  assert.equal(isValidTimezone("Europe/Stockholm"), true);
  assert.equal(isValidTimezone("Moon/Sea_of_Tranquility"), false);
});

test("validates Discord message length", () => {
  assert.equal(validateMessage("Hello"), null);
  assert.match(validateMessage(""), /cannot be empty/);
  assert.match(validateMessage("x".repeat(2_001)), /2,000/);
});
