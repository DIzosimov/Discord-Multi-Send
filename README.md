# Discord Multicast Bot

A small, single-server Discord bot that sends one saved message to any number of saved channels. It supports recurring schedules, manual broadcasts, persistent configuration, and role-restricted management commands.

## What it does

- Broadcasts one message to every configured text or announcement channel.
- Automatically includes current and future text/announcement channels under saved categories.
- Restores channel/category destinations, message, schedule, and authorized roles after restarts.
- Supports standard five-field cron schedules and IANA timezones.
- Allows only Administrator, Manage Server, or explicitly authorized roles to use commands.
- Allows only Administrator or Manage Server to change the authorized roles.
- Disables mentions by default to prevent accidental mass pings.

## 1. Create the Discord application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and select **New Application**.
2. Open **Bot**, create the bot user, and copy/reset its token. Never share or commit this token.
3. Open **OAuth2 → URL Generator**.
4. Select the `bot` and `applications.commands` scopes.
5. Select these bot permissions:
   - View Channels
   - Send Messages
   - Embed Links
6. Open the generated URL and invite the bot to your server.

No privileged gateway intents are required.

## 2. Configure and run it

Install Node.js 20 or newer, then run:

```bash
cp .env.example .env
npm install
npm start
```

Fill in `.env` before starting:

- `DISCORD_TOKEN`: token from the Developer Portal's Bot page.
- `DISCORD_CLIENT_ID`: Application ID from **General Information**.
- `DISCORD_GUILD_ID`: your Discord server ID. Enable Discord Developer Mode and right-click the server to copy it.
- `DATA_FILE`: location of the persistent configuration file.
- `ALLOW_MENTIONS`: keep `false` unless the bot should produce real pings.
- `SILENT_BROADCASTS`: defaults to `true`, preventing broadcast copies from producing push or desktop notifications. Set it to `false` to restore notifications.

The bot registers its guild slash commands on startup. Guild commands normally appear immediately.

## 3. Configure it from Discord

An Administrator or someone with Manage Server should run these commands once:

```text
/access add-role role:@AnnouncementsTeam
/channel add channel:#announcements
/channel add channel:#events
/channel add channel:#general
/category add category:Community Channels
```

Categories are resolved again before every broadcast. A new text or announcement channel placed under a saved category is therefore included automatically; moving it out excludes it. Manually added and category-derived destinations are deduplicated.

The bot must have **View Channel** and **Send Messages** in every destination. For a category, open **Edit Category → Permissions**, add the bot's role, allow both permissions, and synchronize the child channels if Discord offers that option. A child-channel override can still deny access even when the category allows it.

Save the message and schedule it for 09:00 every weekday in Stockholm time:

```text
/schedule set cron:0 9 * * 1-5 timezone:Europe/Stockholm message:Your message here
```

The channel list is saved. Future broadcasts go to all of those channels without selecting them again.

Useful commands:

```text
/broadcast
/broadcast message:A one-off message that is not saved
/schedule message text:Replace the saved recurring message
/schedule status
/schedule pause
/schedule resume
/channel list
/channel remove channel:#general
/category add category:Event Channels
/category list
/category remove category:Event Channels
/access list
/access remove-role role:@AnnouncementsTeam
```

## Cron examples

| Desired schedule | Cron expression |
|---|---|
| Every day at 09:00 | `0 9 * * *` |
| Weekdays at 09:00 | `0 9 * * 1-5` |
| Every Monday at 10:30 | `30 10 * * 1` |
| Every six hours | `0 */6 * * *` |
| Every 30 minutes | `*/30 * * * *` |

Cron uses the timezone saved with `/schedule set`, including daylight-saving changes.

## Keep it online

The process must be running when a message is due. On a VPS or home server, use Docker:

```bash
docker build -t discord-multicast-bot .
docker run -d \
  --name discord-multicast-bot \
  --restart unless-stopped \
  --env-file .env \
  -v "$(pwd)/data:/app/data" \
  discord-multicast-bot
```

The mounted `data` directory keeps the configuration across container replacements.

## Security notes

- Never paste the bot token into Discord or commit `.env`.
- If the token is exposed, reset it immediately in the Developer Portal.
- Keep `ALLOW_MENTIONS=false` unless role or mass mentions are intentional.
- Keep `SILENT_BROADCASTS=true` to show broadcasts without triggering notification sounds.
- Give the bot only View Channel and Send Messages access in channels it should use.
- This project targets one Discord server. Its commands are registered only to `DISCORD_GUILD_ID`.

## Test it

```bash
npm test
```
