# Slack & Discord App Configuration Guide

> **Constella AI Platform** — Multi-Channel Agent Integration
>
> This guide walks you through creating and configuring Slack and Discord
> applications so that your Constella agent swarm can receive messages,
> route them through NATS to the appropriate agent, and reply directly
> in the channel.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Slack Setup](#slack-setup)
   - [Create a Slack App](#1-create-a-slack-app)
   - [Configure Bot Scopes](#2-configure-bot-scopes)
   - [Enable Event Subscriptions](#3-enable-event-subscriptions)
   - [Install to Workspace](#4-install-to-workspace)
   - [Collect Credentials](#5-collect-slack-credentials)
3. [Discord Setup](#discord-setup)
   - [Create a Discord Application](#1-create-a-discord-application)
   - [Add a Bot User](#2-add-a-bot-user)
   - [Register Slash Commands](#3-register-slash-commands)
   - [Set Interactions Endpoint](#4-set-interactions-endpoint)
   - [Invite the Bot](#5-invite-the-bot)
   - [Collect Credentials](#6-collect-discord-credentials)
4. [Environment Variables](#environment-variables)
5. [Verifying the Integration](#verifying-the-integration)
6. [Agent Routing](#agent-routing)
7. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
User (Slack/Discord)
       │
       ▼
┌──────────────────┐     ┌──────────────┐     ┌─────────────────┐
│  API Gateway     │────▶│   NATS       │────▶│  Agent Service  │
│  /webhooks/slack │     │  Message Bus │     │  (CodeCraft,    │
│  /webhooks/discord     └──────────────┘     │   SecuriShield, │
└──────────────────┘            │              │   DesignForge…) │
       ▲                        │              └─────────────────┘
       │                        │                      │
       └────────────────────────┴──────────────────────┘
                    Agent Response → Channel Reply
```

**Flow:**
1. User sends a message or slash command in Slack/Discord.
2. The platform's webhook endpoint receives the event.
3. The connector extracts the target agent (via `@mention` or slash command option).
4. The message is published to NATS on the agent's inbox subject.
5. The agent processes the request and publishes a response.
6. The connector picks up the response and replies in the channel thread.

---

## Slack Setup

### 1. Create a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps).
2. Click **Create New App** → **From scratch**.
3. Name it `Constella AI` (or your preferred name).
4. Select the workspace where you want to install it.
5. Click **Create App**.

### 2. Configure Bot Scopes

Navigate to **OAuth & Permissions** in the left sidebar and add these **Bot Token Scopes**:

| Scope | Purpose |
|-------|---------|
| `app_mentions:read` | Receive `app_mention` events when users `@mention` the bot |
| `chat:write` | Send messages and replies in channels |
| `chat:write.customize` | Customise bot name/icon per message (optional) |
| `im:history` | Read DM messages sent to the bot |
| `im:read` | View DM channels |
| `im:write` | Send DM messages |
| `users:read` | Look up user display names for attribution |

### 3. Enable Event Subscriptions

1. Navigate to **Event Subscriptions** in the left sidebar.
2. Toggle **Enable Events** to **On**.
3. Set the **Request URL** to:
   ```
   https://<YOUR_DOMAIN>/webhooks/slack/events
   ```
   > For local development with ngrok: `https://<NGROK_ID>.ngrok-free.app/webhooks/slack/events`
4. Slack will send a `url_verification` challenge — the connector handles this automatically.
5. Under **Subscribe to bot events**, add:
   - `app_mention` — triggers when a user `@mentions` the bot
   - `message.im` — triggers on direct messages to the bot
6. Click **Save Changes**.

### 4. Install to Workspace

1. Navigate to **Install App** in the left sidebar.
2. Click **Install to Workspace** and authorize.
3. Copy the **Bot User OAuth Token** (`xoxb-...`).

### 5. Collect Slack Credentials

You need two values from the Slack dashboard:

| Value | Where to find it |
|-------|-----------------|
| `SLACK_BOT_TOKEN` | **OAuth & Permissions** → Bot User OAuth Token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | **Basic Information** → App Credentials → Signing Secret |

Optional:

| Value | Where to find it |
|-------|-----------------|
| `SLACK_APP_TOKEN` | **Basic Information** → App-Level Tokens (for Socket Mode, `xapp-...`) |

---

## Discord Setup

### 1. Create a Discord Application

1. Go to [https://discord.com/developers/applications](https://discord.com/developers/applications).
2. Click **New Application**.
3. Name it `Constella AI` and click **Create**.
4. Note the **Application ID** and **Public Key** from the General Information page.

### 2. Add a Bot User

1. Navigate to the **Bot** tab in the left sidebar.
2. Click **Add Bot** → **Yes, do it!** (if not already created).
3. Under **Token**, click **Reset Token** and copy the bot token.
4. Under **Privileged Gateway Intents**, enable:
   - **Message Content Intent** (required to read message text)

### 3. Register Slash Commands

Register a global slash command so users can interact with agents:

```bash
# Replace the placeholders with your actual values
DISCORD_BOT_TOKEN="Bot YOUR_BOT_TOKEN"
DISCORD_APPLICATION_ID="YOUR_APPLICATION_ID"

curl -X POST \
  "https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands" \
  -H "Authorization: ${DISCORD_BOT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "constella",
    "description": "Ask the Constella AI agent swarm",
    "type": 1,
    "options": [
      {
        "name": "message",
        "description": "What would you like the AI to do?",
        "type": 3,
        "required": true
      },
      {
        "name": "agent",
        "description": "Target a specific agent (optional)",
        "type": 3,
        "required": false,
        "choices": [
          { "name": "CodeCraft (Code Generation)", "value": "codecraft" },
          { "name": "SecuriShield (Security)", "value": "securishield" },
          { "name": "DesignForge (Architecture)", "value": "designforge" },
          { "name": "PerfPulse (Performance)", "value": "perfpulse" },
          { "name": "Evaluator (Quality)", "value": "evaluator" },
          { "name": "ExpressOps (Backend)", "value": "expressops" },
          { "name": "Database Agent (DB)", "value": "database-agent" },
          { "name": "SOC2 Compliance", "value": "soc2-compliance" }
        ]
      }
    ]
  }'
```

You should get back a JSON response with `"name": "constella"` confirming the command was registered. Global commands can take up to 1 hour to propagate; guild commands are instant (replace `/applications/{id}/commands` with `/applications/{id}/guilds/{guild_id}/commands` for guild-specific registration during development).

### 4. Set Interactions Endpoint

1. Navigate to **General Information** in the Discord Developer Portal.
2. Set the **Interactions Endpoint URL** to:
   ```
   https://<YOUR_DOMAIN>/webhooks/discord/events
   ```
   > For local development: `https://<NGROK_ID>.ngrok-free.app/webhooks/discord/events`
3. Discord will send a PING interaction — the connector responds with PONG automatically.
4. Click **Save Changes**. Discord will verify the endpoint before saving.

### 5. Invite the Bot

Generate an invite URL with the proper permissions:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_APPLICATION_ID&permissions=2147483648&scope=bot%20applications.commands
```

| Permission | Value | Purpose |
|-----------|-------|---------|
| `Send Messages` | `0x800` | Reply to interactions |
| `Use Slash Commands` | `0x80000000` | Register and use slash commands |
| `Read Message History` | `0x10000` | Access message context |

Or use the **OAuth2 → URL Generator** in the Developer Portal with scopes `bot` and `applications.commands`.

### 6. Collect Discord Credentials

| Value | Where to find it |
|-------|-----------------|
| `DISCORD_BOT_TOKEN` | **Bot** → Token (prefix with `Bot ` when setting env var) |
| `DISCORD_PUBLIC_KEY` | **General Information** → Public Key |
| `DISCORD_APPLICATION_ID` | **General Information** → Application ID |

---

## Environment Variables

Add the following to your `.env` file (or `.env.production` for deployment):

```bash
# ─── Slack Configuration ─────────────────────────────────────────────────────
# Required: Set both to enable the Slack connector
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret

# Optional
SLACK_APP_TOKEN=xapp-your-app-level-token       # Only needed for Socket Mode
SLACK_REPLY_TIMEOUT=30000                         # ms to wait for agent reply (default: 30000)
SLACK_DEFAULT_AGENT=orchestrator-py               # Fallback agent when no @mention (default: orchestrator-py)

# ─── Discord Configuration ───────────────────────────────────────────────────
# Required: Set all three to enable the Discord connector
DISCORD_BOT_TOKEN=Bot your-bot-token
DISCORD_PUBLIC_KEY=your-public-key-hex
DISCORD_APPLICATION_ID=your-application-id

# Optional
DISCORD_REPLY_TIMEOUT=30000                       # ms to wait for agent reply (default: 30000)
DISCORD_DEFAULT_AGENT=orchestrator-py             # Fallback agent when no agent option (default: orchestrator-py)

# ─── Shared Infrastructure ───────────────────────────────────────────────────
NATS_URL=nats://localhost:4222                    # NATS server for agent messaging
```

**The API Gateway automatically enables each connector when its required env vars are present.** Check the startup logs for confirmation:

```
✅ Slack webhook connector enabled at /webhooks/slack/events
✅ Discord webhook connector enabled at /webhooks/discord/events
```

If the variables are not set, you will see:

```
ℹ️  Slack webhook connector disabled (SLACK_BOT_TOKEN or SLACK_SIGNING_SECRET not set)
ℹ️  Discord webhook connector disabled (DISCORD_BOT_TOKEN, DISCORD_PUBLIC_KEY, or DISCORD_APPLICATION_ID not set)
```

---

## Verifying the Integration

### Slack

1. **URL Verification**: When you save the Event Subscriptions URL, Slack sends a challenge. If it succeeds, the connector is reachable.

2. **Send a test message**: In Slack, mention the bot:
   ```
   @Constella AI review this Express middleware for security issues
   ```
   Or send a DM to the bot directly.

3. **Check logs**: The API Gateway logs will show:
   ```
   [SlackConnector] Received app_mention event in channel C1234567
   [SlackConnector] Routing to agent: securishield (correlationId: abc-123)
   ```

### Discord

1. **PING/PONG**: Discord verifies the endpoint automatically when you save the Interactions URL.

2. **Use the slash command**: In any channel where the bot is present:
   ```
   /constella message: Analyze my API for performance bottlenecks agent: perfpulse
   ```

3. **Check logs**: The API Gateway logs will show:
   ```
   [DiscordConnector] Received APPLICATION_COMMAND interaction
   [DiscordConnector] Routing to agent: perfpulse (correlationId: xyz-789)
   ```

### Quick Health Check (curl)

```bash
# Test Slack endpoint responds (url_verification)
curl -X POST http://localhost:3000/webhooks/slack/events \
  -H "Content-Type: application/json" \
  -d '{"type": "url_verification", "challenge": "test123"}'
# Expected: {"challenge": "test123"}

# Test Discord endpoint responds (PING)
curl -X POST http://localhost:3000/webhooks/discord/events \
  -H "Content-Type: application/json" \
  -d '{"type": 1}'
# Expected: {"type": 1}
```

---

## Agent Routing

Both connectors support **agent targeting** via mentions or command options:

### Slack: `@mention` Routing

Users can `@mention` a specific agent by name in their message text:

| Mention Pattern | Routes to |
|----------------|-----------|
| `@codecraft` | `codecraft` agent |
| `@securishield` or `@security` | `securishield` agent |
| `@designforge` or `@architecture` | `designforge` agent |
| `@perfpulse` or `@performance` | `perfpulse` agent |
| `@evaluator` or `@quality` | `evaluator` agent |
| `@database` | `database-agent` |
| `@soc2` or `@compliance` | `soc2-compliance` agent |
| (no agent mentioned) | Routes to `SLACK_DEFAULT_AGENT` |

**Examples:**
```
@Constella AI @codecraft generate a REST endpoint for user authentication
@Constella AI @security scan this code for vulnerabilities: ```python ...```
```

### Discord: Slash Command `agent` Option

The `/constella` slash command has an optional `agent` parameter with predefined choices. If omitted, the message routes to the default agent.

**Examples:**
```
/constella message: Generate a JWT auth middleware agent: codecraft
/constella message: What is the architecture of this system?
```

### NATS Subject Mapping

When a message is routed to an agent, it is published to:
```
constella.agent.{agentId}.inbox
```

The agent's response is expected on:
```
constella.agent.{agentId}.response
```

---

## Troubleshooting

### Slack: "url_verification failed"

- Ensure the API Gateway is running and publicly reachable.
- For local dev, use `ngrok http 3000` and update the Event Subscriptions URL.
- Check that `SLACK_SIGNING_SECRET` matches the value in the Slack app's Basic Information.

### Discord: "Interactions endpoint validation failed"

- The endpoint must respond to PING with PONG within 3 seconds.
- Ensure `DISCORD_PUBLIC_KEY` is correct (the full hex string from General Information).
- The endpoint must be HTTPS (Discord rejects plain HTTP).

### Agent replies are not appearing

1. **NATS not running**: Ensure NATS is up (`docker compose up nats`).
2. **Agent not subscribed**: The target agent must be running and subscribed to its inbox subject.
3. **Timeout**: Increase `SLACK_REPLY_TIMEOUT` or `DISCORD_REPLY_TIMEOUT` if agents are slow.
4. **Check correlation logs**: Search logs for the `correlationId` to trace the message flow.

### Bot is not responding to DMs (Slack)

- Ensure `message.im` is in the bot event subscriptions.
- Ensure `im:history` and `im:read` scopes are granted.
- Reinstall the app after adding new scopes.

### Slash command not appearing (Discord)

- Global commands can take up to **1 hour** to propagate.
- Use guild-specific commands during development for instant availability.
- Ensure the bot has been invited with the `applications.commands` scope.

### Message too long (split messages)

Both connectors automatically split long agent responses:
- **Slack**: Split at 3,900 characters (Slack limit is ~4,000 with formatting room).
- **Discord**: Split at 1,900 characters (Discord limit is 2,000).

The connector prefers splitting at newline boundaries for cleaner output.

---

## Local Development with ngrok

For testing webhooks locally:

```bash
# Install ngrok (if not already installed)
# https://ngrok.com/download

# Start ngrok tunnel
ngrok http 3000

# Copy the https URL (e.g., https://abc123.ngrok-free.app)
# Use it as the base URL for webhook endpoints:
#   Slack:   https://abc123.ngrok-free.app/webhooks/slack/events
#   Discord: https://abc123.ngrok-free.app/webhooks/discord/events
```

> **Tip**: Use `ngrok http 3000 --domain=your-custom.ngrok-free.app` with a
> reserved domain so the URL doesn't change between restarts.

---

## Security Notes

- **Never commit tokens or secrets to version control.** Use `.env` files (already in `.gitignore`).
- Slack requests are verified using **HMAC-SHA256** with the signing secret.
- Discord requests are verified using **Ed25519** with the application public key.
- Both verification middlewares are applied automatically by the connector routers.
- The webhook endpoints are intentionally mounted **outside** the API Gateway's JWT auth middleware, since they use platform-specific verification instead.

---

*Last updated: 2025-07-16*