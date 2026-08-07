import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const DEFAULT_CONFIG = Object.freeze({
  version: 1,
  channelIds: [],
  categoryIds: [],
  allowedRoleIds: [],
  schedule: {
    enabled: false,
    cron: "0 9 * * *",
    timezone: "UTC",
    message: ""
  }
});

function uniqueSnowflakes(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => /^\d{15,22}$/.test(String(value))))];
}

export function normalizeConfig(value = {}) {
  const schedule = value.schedule ?? {};

  return {
    version: 1,
    channelIds: uniqueSnowflakes(value.channelIds),
    categoryIds: uniqueSnowflakes(value.categoryIds),
    allowedRoleIds: uniqueSnowflakes(value.allowedRoleIds),
    schedule: {
      enabled: schedule.enabled === true,
      cron: typeof schedule.cron === "string" ? schedule.cron.trim() : DEFAULT_CONFIG.schedule.cron,
      timezone:
        typeof schedule.timezone === "string"
          ? schedule.timezone.trim()
          : DEFAULT_CONFIG.schedule.timezone,
      message: typeof schedule.message === "string" ? schedule.message : ""
    }
  };
}

export class ConfigStore {
  constructor(filePath) {
    this.filePath = resolve(filePath);
    this.config = structuredClone(DEFAULT_CONFIG);
  }

  async load() {
    await mkdir(dirname(this.filePath), { recursive: true });

    try {
      const contents = await readFile(this.filePath, "utf8");
      this.config = normalizeConfig(JSON.parse(contents));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.save();
    }

    return this.get();
  }

  get() {
    return structuredClone(this.config);
  }

  async update(mutator) {
    const next = this.get();
    await mutator(next);
    this.config = normalizeConfig(next);
    await this.save();
    return this.get();
  }

  async save() {
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(this.config, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
  }
}
