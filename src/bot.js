import cron from "node-cron";
import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  PermissionsBitField
} from "discord.js";
import { isValidCron, isValidTimezone, validateMessage } from "./validation.js";

const ADMIN_PERMISSIONS = new PermissionsBitField([
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild
]);

function memberRoleIds(interaction) {
  const roles = interaction.member?.roles;
  if (roles?.cache) return new Set(roles.cache.keys());
  if (Array.isArray(roles)) return new Set(roles);
  return new Set();
}

function hasAdminAccess(interaction) {
  return interaction.memberPermissions?.any(ADMIN_PERMISSIONS) === true;
}

function hasManagerAccess(interaction, config) {
  if (hasAdminAccess(interaction)) return true;
  const memberRoles = memberRoleIds(interaction);
  return config.allowedRoleIds.some((roleId) => memberRoles.has(roleId));
}

function formatList(values, formatter, fallback) {
  return values.length ? values.map(formatter).join(", ") : fallback;
}

export class MulticastBot {
  constructor({
    client,
    guildId,
    store,
    allowMentions = false,
    silentBroadcasts = true
  }) {
    this.client = client;
    this.guildId = guildId;
    this.store = store;
    this.allowMentions = allowMentions;
    this.silentBroadcasts = silentBroadcasts;
    this.task = null;
  }

  async startScheduler() {
    await this.stopScheduler();
    const config = this.store.get();

    if (!config.schedule.enabled) return;
    if (!isValidCron(config.schedule.cron)) {
      console.error("Saved cron expression is invalid; automatic broadcasts are disabled in memory.");
      return;
    }
    if (!isValidTimezone(config.schedule.timezone)) {
      console.error("Saved timezone is invalid; automatic broadcasts are disabled in memory.");
      return;
    }
    const messageError = validateMessage(config.schedule.message);
    if (messageError || (config.channelIds.length === 0 && config.categoryIds.length === 0)) {
      console.error(
        `Automatic broadcasts are disabled in memory: ${messageError ?? "no destination channels or categories configured"}`
      );
      return;
    }

    this.task = cron.schedule(
      config.schedule.cron,
      async () => {
        const latest = this.store.get();
        const error = validateMessage(latest.schedule.message);
        if (error || (latest.channelIds.length === 0 && latest.categoryIds.length === 0)) {
          console.error(
            `Scheduled broadcast skipped: ${error ?? "no destination channels or categories configured"}`
          );
          return;
        }

        const result = await this.broadcast(latest.schedule.message);
        console.log(
          `Scheduled broadcast finished: ${result.sent.length} sent, ${result.failed.length} failed.`
        );
      },
      {
        name: "discord-multicast-broadcast",
        timezone: config.schedule.timezone,
        noOverlap: true
      }
    );
  }

  async stopScheduler() {
    if (!this.task) return;
    this.task.stop();
    if (typeof this.task.destroy === "function") await this.task.destroy();
    this.task = null;
  }

  async broadcast(message) {
    const config = this.store.get();
    const guild = this.client.guilds.cache.get(this.guildId) ?? await this.client.guilds.fetch(this.guildId);
    const guildChannels = await guild.channels.fetch();
    const botMember = guild.members.me ?? await guild.members.fetchMe();
    const destinationIds = new Set(config.channelIds);

    for (const channel of guildChannels.values()) {
      if (
        channel &&
        config.categoryIds.includes(channel.parentId) &&
        (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
      ) {
        destinationIds.add(channel.id);
      }
    }

    const sent = [];
    const failed = [];

    for (const channelId of destinationIds) {
      try {
        const channel = guildChannels.get(channelId) ?? await guild.channels.fetch(channelId);
        if (!channel?.isTextBased() || typeof channel.send !== "function") {
          throw new Error("Channel is missing or is not text-based");
        }

        const permissions = channel.permissionsFor(botMember);
        const missingPermissions = [];
        if (!permissions?.has(PermissionFlagsBits.ViewChannel)) {
          missingPermissions.push("View Channel");
        }
        if (!permissions?.has(PermissionFlagsBits.SendMessages)) {
          missingPermissions.push("Send Messages");
        }
        if (missingPermissions.length) {
          const reason = `Missing permission${missingPermissions.length === 1 ? "" : "s"}: ${missingPermissions.join(", ")}`;
          failed.push({ channelId, reason });
          console.warn(`Skipped channel ${channelId}: ${reason}.`);
          continue;
        }

        await channel.send({
          content: message,
          ...(this.silentBroadcasts
            ? { flags: MessageFlags.SuppressNotifications }
            : {}),
          allowedMentions: this.allowMentions
            ? { parse: ["users", "roles", "everyone"] }
            : { parse: [] }
        });
        sent.push(channelId);
      } catch (error) {
        const reason =
          error.code === 50001
            ? "Missing Access; allow View Channel and Send Messages for the bot role"
            : error.code === 50013
              ? "Missing Permissions; allow View Channel and Send Messages for the bot role"
              : error.message;
        failed.push({ channelId, reason });
        if (error.code === 50001 || error.code === 50013) {
          console.warn(`Skipped channel ${channelId}: ${reason}.`);
        } else {
          console.error(`Could not send to channel ${channelId}:`, error);
        }
      }
    }

    return { sent, failed };
  }

  async handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.guildId !== this.guildId) return;

    const config = this.store.get();
    if (!hasManagerAccess(interaction, config)) {
      await interaction.reply({
        content: "You do not have an authorized role for this bot.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.commandName === "access" && !hasAdminAccess(interaction)) {
      await interaction.reply({
        content: "Only members with Administrator or Manage Server can change authorized roles.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      switch (interaction.commandName) {
        case "broadcast":
          await this.handleBroadcast(interaction);
          break;
        case "channel":
          await this.handleChannel(interaction);
          break;
        case "category":
          await this.handleCategory(interaction);
          break;
        case "schedule":
          await this.handleSchedule(interaction);
          break;
        case "access":
          await this.handleAccess(interaction);
          break;
        default:
          await interaction.editReply("Unknown command.");
      }
    } catch (error) {
      console.error("Command failed:", error);
      await interaction.editReply(`Command failed: ${error.message}`);
    }
  }

  async handleBroadcast(interaction) {
    const config = this.store.get();
    const message = interaction.options.getString("message") ?? config.schedule.message;
    const error = validateMessage(message);
    if (error) return interaction.editReply(error);
    if (config.channelIds.length === 0 && config.categoryIds.length === 0) {
      return interaction.editReply(
        "No destinations are configured. Use `/channel add` or `/category add` first."
      );
    }

    const result = await this.broadcast(message);
    const permissionFailures = result.failed.filter(({ reason }) => reason.startsWith("Missing"));
    const failureText = result.failed.length
      ? ` Failed: ${result.failed.map(({ channelId }) => `<#${channelId}>`).join(", ")}.`
      : "";
    const permissionHelp = permissionFailures.length
      ? " Grant the bot role View Channel and Send Messages in those channels or their parent category."
      : "";
    await interaction.editReply(
      `Sent to ${result.sent.length} channel(s).${failureText}${permissionHelp}`
    );
  }

  async handleChannel(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "list") {
      const { channelIds } = this.store.get();
      return interaction.editReply(
        `Destinations: ${formatList(channelIds, (id) => `<#${id}>`, "none")}`
      );
    }

    const selectedChannel = interaction.options.getChannel("channel", true);
    const guild = interaction.guild ?? this.client.guilds.cache.get(this.guildId);
    if (!guild) {
      return interaction.editReply(
        "I am not installed as a bot member in this server. Reinstall the app using Guild Install with both the `bot` and `applications.commands` scopes, then restart me."
      );
    }
    const channel = await guild.channels.fetch(selectedChannel.id);
    if (!channel?.isTextBased() || typeof channel.send !== "function") {
      return interaction.editReply("That destination is missing or is not a text channel.");
    }

    if (subcommand === "add") {
      const botMember = guild.members.me ?? await guild.members.fetchMe();
      const permissions = channel.permissionsFor(botMember);
      const canSend = permissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages
      ]);
      if (!canSend) {
        return interaction.editReply(
          `I need View Channel and Send Messages permissions in ${channel}.`
        );
      }

      const updated = await this.store.update((next) => {
        next.channelIds.push(channel.id);
      });
      await this.startScheduler();
      return interaction.editReply(
        `Added ${channel}. ${updated.channelIds.length} destination channel(s) configured.`
      );
    }

    const updated = await this.store.update((next) => {
      next.channelIds = next.channelIds.filter((id) => id !== channel.id);
    });
    await this.startScheduler();
    return interaction.editReply(
      `Removed ${channel}. ${updated.channelIds.length} destination channel(s) remain.`
    );
  }

  async handleCategory(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "list") {
      const { categoryIds } = this.store.get();
      return interaction.editReply(
        `Automatic categories: ${formatList(categoryIds, (id) => `\`${id}\``, "none")}`
      );
    }

    const selectedCategory = interaction.options.getChannel("category", true);
    const guild = interaction.guild ?? this.client.guilds.cache.get(this.guildId);
    if (!guild) {
      return interaction.editReply(
        "I am not installed as a bot member in this server. Reinstall the app using Guild Install with both the `bot` and `applications.commands` scopes, then restart me."
      );
    }

    const category = await guild.channels.fetch(selectedCategory.id);
    if (!category || category.type !== ChannelType.GuildCategory) {
      return interaction.editReply("That destination is missing or is not a category.");
    }

    if (subcommand === "add") {
      const updated = await this.store.update((next) => {
        next.categoryIds.push(category.id);
      });
      await this.startScheduler();
      return interaction.editReply(
        `Added **${category.name}**. Text and announcement channels placed under it will be included automatically. ${updated.categoryIds.length} category or categories configured.`
      );
    }

    const updated = await this.store.update((next) => {
      next.categoryIds = next.categoryIds.filter((id) => id !== category.id);
    });
    await this.startScheduler();
    return interaction.editReply(
      `Removed **${category.name}**. ${updated.categoryIds.length} automatic category or categories remain.`
    );
  }

  async handleSchedule(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "status") {
      const config = this.store.get();
      const messageState = config.schedule.message ? "configured" : "not configured";
      return interaction.editReply(
        [
          `**Status:** ${config.schedule.enabled ? "running" : "paused"}`,
          `**Cron:** \`${config.schedule.cron}\``,
          `**Timezone:** \`${config.schedule.timezone}\``,
          `**Message:** ${messageState}`,
          `**Channels:** ${formatList(config.channelIds, (id) => `<#${id}>`, "none")}`,
          `**Automatic categories:** ${formatList(config.categoryIds, (id) => `\`${id}\``, "none")}`,
          `**Authorized roles:** ${formatList(config.allowedRoleIds, (id) => `<@&${id}>`, "admins only")}`
        ].join("\n")
      );
    }

    if (subcommand === "set") {
      const config = this.store.get();
      const expression = interaction.options.getString("cron", true).trim();
      const timezone = (
        interaction.options.getString("timezone") ?? config.schedule.timezone
      ).trim();
      const message = interaction.options.getString("message") ?? config.schedule.message;

      if (!isValidCron(expression)) {
        return interaction.editReply("That cron expression is invalid. Use five fields, for example `0 9 * * 1-5`.");
      }
      if (!isValidTimezone(timezone)) {
        return interaction.editReply("That timezone is invalid. Use an IANA name such as `Europe/Stockholm`.");
      }
      const messageError = validateMessage(message);
      if (messageError) return interaction.editReply(messageError);
      if (config.channelIds.length === 0 && config.categoryIds.length === 0) {
        return interaction.editReply(
          "Add at least one destination with `/channel add` or `/category add` first."
        );
      }

      await this.store.update((next) => {
        next.schedule.cron = expression;
        next.schedule.timezone = timezone;
        next.schedule.message = message;
        next.schedule.enabled = true;
      });
      await this.startScheduler();
      return interaction.editReply(
        `Schedule enabled with \`${expression}\` in \`${timezone}\`.`
      );
    }

    if (subcommand === "message") {
      const message = interaction.options.getString("text", true);
      const messageError = validateMessage(message);
      if (messageError) return interaction.editReply(messageError);
      await this.store.update((next) => {
        next.schedule.message = message;
      });
      return interaction.editReply("Saved the new broadcast message.");
    }

    if (subcommand === "pause") {
      await this.store.update((next) => {
        next.schedule.enabled = false;
      });
      await this.stopScheduler();
      return interaction.editReply("Automatic broadcasts are paused.");
    }

    const config = this.store.get();
    const messageError = validateMessage(config.schedule.message);
    if (messageError) return interaction.editReply(messageError);
    if (config.channelIds.length === 0 && config.categoryIds.length === 0) {
      return interaction.editReply(
        "Add at least one destination with `/channel add` or `/category add` first."
      );
    }
    await this.store.update((next) => {
      next.schedule.enabled = true;
    });
    await this.startScheduler();
    return interaction.editReply("Automatic broadcasts are running.");
  }

  async handleAccess(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "list") {
      const { allowedRoleIds } = this.store.get();
      return interaction.editReply(
        `Authorized roles: ${formatList(allowedRoleIds, (id) => `<@&${id}>`, "none (admins only)")}`
      );
    }

    const role = interaction.options.getRole("role", true);
    if (role.id === interaction.guildId) {
      return interaction.editReply("The `@everyone` role cannot be added.");
    }

    if (subcommand === "add-role") {
      await this.store.update((next) => {
        next.allowedRoleIds.push(role.id);
      });
      return interaction.editReply(`Authorized ${role} to manage broadcasts.`);
    }

    await this.store.update((next) => {
      next.allowedRoleIds = next.allowedRoleIds.filter((id) => id !== role.id);
    });
    return interaction.editReply(`Removed ${role} from the authorized roles.`);
  }
}
