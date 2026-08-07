import assert from "node:assert/strict";
import test from "node:test";
import { ChannelType, MessageFlags } from "discord.js";
import { MulticastBot } from "../src/bot.js";

test("channel add fetches a full guild channel before checking permissions", async () => {
  const config = {
    channelIds: [],
    categoryIds: [],
    allowedRoleIds: [],
    schedule: { enabled: false, cron: "0 9 * * *", timezone: "UTC", message: "" }
  };
  const store = {
    get: () => structuredClone(config),
    update: async (mutator) => {
      await mutator(config);
      config.channelIds = [...new Set(config.channelIds)];
      return structuredClone(config);
    }
  };
  const fullChannel = {
    id: "123456789012345",
    isTextBased: () => true,
    send: async () => {},
    permissionsFor: () => ({ has: () => true }),
    toString: () => "<#123456789012345>"
  };
  const guild = {
    channels: { fetch: async (id) => (id === fullChannel.id ? fullChannel : null) },
    members: { me: { id: "999999999999999" } }
  };
  const client = {
    user: { id: "999999999999999" },
    guilds: { cache: new Map([["888888888888888", guild]]) }
  };
  const bot = new MulticastBot({ client, guildId: "888888888888888", store });
  bot.startScheduler = async () => {};

  let reply;
  const interaction = {
    options: {
      getSubcommand: () => "add",
      getChannel: () => ({ id: fullChannel.id })
    },
    guild: null,
    editReply: async (message) => {
      reply = message;
    }
  };

  await bot.handleChannel(interaction);

  assert.deepEqual(config.channelIds, [fullChannel.id]);
  assert.match(reply, /Added/);
});

test("channel add explains when the app is not guild-installed", async () => {
  const store = {
    get: () => ({
      channelIds: [],
      categoryIds: [],
      allowedRoleIds: [],
      schedule: { enabled: false, cron: "0 9 * * *", timezone: "UTC", message: "" }
    })
  };
  const client = {
    user: { id: "999999999999999" },
    guilds: { cache: new Map() }
  };
  const bot = new MulticastBot({ client, guildId: "888888888888888", store });
  let reply;

  await bot.handleChannel({
    options: {
      getSubcommand: () => "add",
      getChannel: () => ({ id: "123456789012345" })
    },
    guild: null,
    editReply: async (message) => {
      reply = message;
    }
  });

  assert.match(reply, /not installed as a bot member/);
});

test("broadcast dynamically includes category children and removes duplicates", async () => {
  const categoryId = "444444444444444";
  const delivered = [];
  const makeChannel = (id, type, parentId) => ({
    id,
    type,
    parentId,
    isTextBased: () => type === ChannelType.GuildText || type === ChannelType.GuildAnnouncement,
    permissionsFor: () => ({ has: () => true }),
    send: async (payload) => delivered.push({ id, payload })
  });

  const manual = makeChannel("111111111111111", ChannelType.GuildText, null);
  const categoryChild = makeChannel("222222222222222", ChannelType.GuildText, categoryId);
  const announcementChild = makeChannel(
    "333333333333333",
    ChannelType.GuildAnnouncement,
    categoryId
  );
  const ignoredVoice = makeChannel("555555555555555", ChannelType.GuildVoice, categoryId);
  const ignoredOtherCategory = makeChannel(
    "666666666666666",
    ChannelType.GuildText,
    "777777777777777"
  );
  const channels = new Map(
    [manual, categoryChild, announcementChild, ignoredVoice, ignoredOtherCategory].map((channel) => [
      channel.id,
      channel
    ])
  );
  const guild = {
    channels: {
      fetch: async (id) => (id ? channels.get(id) : channels)
    },
    members: { me: { id: "999999999999999" } }
  };
  const store = {
    get: () => ({
      channelIds: [manual.id, categoryChild.id],
      categoryIds: [categoryId],
      allowedRoleIds: [],
      schedule: { enabled: false, cron: "0 9 * * *", timezone: "UTC", message: "Hello" }
    })
  };
  const client = {
    guilds: { cache: new Map([["888888888888888", guild]]) }
  };
  const bot = new MulticastBot({ client, guildId: "888888888888888", store });

  const result = await bot.broadcast("Hello");

  assert.deepEqual(result.failed, []);
  assert.deepEqual(new Set(result.sent), new Set([manual.id, categoryChild.id, announcementChild.id]));
  assert.equal(delivered.length, 3);
  assert.ok(delivered.every(({ payload }) => payload.allowedMentions.parse.length === 0));
  assert.ok(
    delivered.every(({ payload }) => payload.flags === MessageFlags.SuppressNotifications)
  );
});

test("broadcast notifications can be explicitly enabled", async () => {
  let deliveredPayload;
  const channel = {
    id: "111111111111111",
    type: ChannelType.GuildText,
    parentId: null,
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => true }),
    send: async (payload) => {
      deliveredPayload = payload;
    }
  };
  const channels = new Map([[channel.id, channel]]);
  const guild = {
    channels: { fetch: async (id) => (id ? channels.get(id) : channels) },
    members: { me: { id: "999999999999999" } }
  };
  const store = {
    get: () => ({
      channelIds: [channel.id],
      categoryIds: [],
      allowedRoleIds: [],
      schedule: { enabled: false, cron: "0 9 * * *", timezone: "UTC", message: "Hello" }
    })
  };
  const client = { guilds: { cache: new Map([["888888888888888", guild]]) } };
  const bot = new MulticastBot({
    client,
    guildId: "888888888888888",
    store,
    silentBroadcasts: false
  });

  await bot.broadcast("Hello");

  assert.equal(deliveredPayload.flags, undefined);
});

test("broadcast skips channels where the bot lacks access", async () => {
  let attemptedSend = false;
  const channel = {
    id: "111111111111111",
    type: ChannelType.GuildText,
    parentId: null,
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => false }),
    send: async () => {
      attemptedSend = true;
    }
  };
  const channels = new Map([[channel.id, channel]]);
  const guild = {
    channels: { fetch: async (id) => (id ? channels.get(id) : channels) },
    members: { me: { id: "999999999999999" } }
  };
  const store = {
    get: () => ({
      channelIds: [channel.id],
      categoryIds: [],
      allowedRoleIds: [],
      schedule: { enabled: false, cron: "0 9 * * *", timezone: "UTC", message: "Hello" }
    })
  };
  const client = { guilds: { cache: new Map([["888888888888888", guild]]) } };
  const bot = new MulticastBot({ client, guildId: "888888888888888", store });

  const result = await bot.broadcast("Hello");

  assert.equal(attemptedSend, false);
  assert.deepEqual(result.sent, []);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0].reason, /View Channel/);
  assert.match(result.failed[0].reason, /Send Messages/);
});
