import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes
} from "discord.js";
import { MulticastBot } from "./bot.js";
import { commandData } from "./commands.js";
import { ConfigStore } from "./config-store.js";

const requiredEnvironment = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DISCORD_GUILD_ID"];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);

if (missingEnvironment.length) {
  throw new Error(`Missing required environment variables: ${missingEnvironment.join(", ")}`);
}

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const dataFile = process.env.DATA_FILE ?? "./data/config.json";
const allowMentions = process.env.ALLOW_MENTIONS?.toLowerCase() === "true";

const store = new ConfigStore(dataFile);
await store.load();

const rest = new REST({ version: "10" }).setToken(token);
await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData });
console.log(`Registered ${commandData.length} guild slash commands.`);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const multicastBot = new MulticastBot({ client, guildId, store, allowMentions });

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}.`);

  if (!readyClient.guilds.cache.has(guildId)) {
    console.error(
      [
        `The bot is not a member of the configured server (${guildId}).`,
        "In the Discord Developer Portal, install the app to the server using Guild Install.",
        "The installation must include both the bot and applications.commands scopes.",
        "Also verify that DISCORD_GUILD_ID matches the server's Copy Server ID value."
      ].join("\n")
    );
    readyClient.destroy();
    process.exitCode = 1;
    return;
  }

  await multicastBot.startScheduler();
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await multicastBot.handleInteraction(interaction);
  } catch (error) {
    console.error("Unhandled interaction error:", error);
  }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    console.log(`Received ${signal}; shutting down.`);
    await multicastBot.stopScheduler();
    client.destroy();
    process.exit(0);
  });
}

await client.login(token);
