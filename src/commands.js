import { ChannelType, SlashCommandBuilder } from "discord.js";

export const commandBuilders = [
  new SlashCommandBuilder()
    .setName("broadcast")
    .setDescription("Send a message to every saved destination channel")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Optional one-off message; otherwise the saved scheduled message is used")
        .setMaxLength(2_000)
    ),

  new SlashCommandBuilder()
    .setName("channel")
    .setDescription("Manage destination channels")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a destination channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to receive broadcasts")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a destination channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to remove")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List all destination channels")
    ),

  new SlashCommandBuilder()
    .setName("category")
    .setDescription("Automatically include channels under saved categories")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Include current and future channels under a category")
        .addChannelOption((option) =>
          option
            .setName("category")
            .setDescription("Category whose text channels should receive broadcasts")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Stop automatically including a category")
        .addChannelOption((option) =>
          option
            .setName("category")
            .setDescription("Category to remove")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List all automatically included categories")
    ),

  new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("Manage the recurring broadcast schedule")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Save and enable a recurring schedule")
        .addStringOption((option) =>
          option
            .setName("cron")
            .setDescription("Five-part cron expression, such as 0 9 * * 1-5")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("timezone")
            .setDescription("IANA timezone, such as Europe/Stockholm")
        )
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Message to save; omit to keep the current message")
            .setMaxLength(2_000)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("message")
        .setDescription("Change the saved broadcast message")
        .addStringOption((option) =>
          option
            .setName("text")
            .setDescription("New message")
            .setMaxLength(2_000)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("pause").setDescription("Pause automatic broadcasts")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("resume").setDescription("Resume automatic broadcasts")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("status").setDescription("Show the current schedule and destinations")
    ),

  new SlashCommandBuilder()
    .setName("access")
    .setDescription("Manage roles allowed to control this bot")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add-role")
        .setDescription("Allow a role to manage broadcasts")
        .addRoleOption((option) =>
          option.setName("role").setDescription("Role to allow").setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove-role")
        .setDescription("Remove a role from the access list")
        .addRoleOption((option) =>
          option.setName("role").setDescription("Role to remove").setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List roles allowed to manage broadcasts")
    )
];

export const commandData = commandBuilders.map((command) => command.toJSON());
