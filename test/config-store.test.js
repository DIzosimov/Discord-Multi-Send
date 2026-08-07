import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ConfigStore, normalizeConfig } from "../src/config-store.js";

test("normalizeConfig removes duplicate and invalid IDs", () => {
  const config = normalizeConfig({
    channelIds: ["123456789012345", "bad", "123456789012345"],
    categoryIds: ["345678901234567", "345678901234567"],
    allowedRoleIds: ["234567890123456"]
  });

  assert.deepEqual(config.channelIds, ["123456789012345"]);
  assert.deepEqual(config.categoryIds, ["345678901234567"]);
  assert.deepEqual(config.allowedRoleIds, ["234567890123456"]);
});

test("ConfigStore persists updates", async () => {
  const directory = await mkdtemp(join(tmpdir(), "multicast-bot-"));
  const filePath = join(directory, "config.json");
  const store = new ConfigStore(filePath);

  await store.load();
  await store.update((config) => {
    config.channelIds.push("123456789012345");
    config.categoryIds.push("345678901234567");
    config.schedule.message = "Hello";
  });

  const reloaded = new ConfigStore(filePath);
  const config = await reloaded.load();
  assert.deepEqual(config.channelIds, ["123456789012345"]);
  assert.deepEqual(config.categoryIds, ["345678901234567"]);
  assert.equal(config.schedule.message, "Hello");
  assert.match(await readFile(filePath, "utf8"), /"Hello"/);
});
