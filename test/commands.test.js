import assert from "node:assert/strict";
import test from "node:test";
import { commandData } from "../src/commands.js";

test("builds the expected unique guild commands", () => {
  assert.deepEqual(
    commandData.map(({ name }) => name),
    ["broadcast", "channel", "category", "schedule", "access"]
  );
  assert.equal(new Set(commandData.map(({ name }) => name)).size, commandData.length);
});
