# StandupSense for Education 🎓🤖

> **Zero forms. Zero effort. Automatic volunteer coordination for education nonprofits.**

StandupSense is a Slack agent built for education nonprofits and volunteer teaching organizations. Instead of asking volunteers to fill out forms or respond to bot prompts, StandupSense passively reads natural Slack conversations, filters out noise, uses AI to extract what every volunteer accomplished, surfaces blockers instantly, and syncs everything to Notion through a real MCP server integration — giving program directors real-time visibility into their entire volunteer network.

---

## The Problem

Thousands of education nonprofits — tutoring programs, after-school initiatives, literacy drives — run on volunteer coordination. These teams use Slack to communicate but have no way to track:

- What each volunteer teacher accomplished today
- Which volunteers are blocked on resources (textbooks, room access, student materials)
- What students need follow-up tomorrow

Program directors are flying blind. Blockers go unnoticed. Students fall through the cracks.

## The Solution

StandupSense gives education nonprofits — completely free — what Fortune 500 companies pay thousands for: **automatic daily coordination with zero friction.**

Volunteers just talk normally in Slack. StandupSense does everything else.

---

## How It Works

```
Volunteers chat naturally in Slack throughout the day
                    ↓
      @StandupSense check (or auto at scheduled time)
                    ↓
      Fetches every message since midnight, per channel
                    ↓
      Pre-filters noise: greetings, reactions, one-word
      replies, emoji-only messages, bare links
                    ↓
      Groups remaining messages by volunteer (capped at
      25 most recent per person to protect token budget)
                    ↓
      Groq AI (LLaMA 3.3 70B) extracts:
      ✅ What they completed
      🔨 What they're working on
      🚧 Any resource blockers
      (explicitly instructed to ignore banter and never
      fabricate an update when no real content exists)
                    ↓
      MCP Client (official SDK) calls Notion MCP Server
      via StreamableHTTP transport, JSON-RPC 2.0
                    ↓
      Notion database updated with a permanent record
                    ↓
      Rich Block Kit digest posted in Slack with
      blocker count and direct link to Notion board
```

---

## Features

- 🤖 **AI-powered extraction** — Groq AI reads natural volunteer conversation and extracts structured standup data
- 🔌 **Real MCP server integration** — uses the official `@modelcontextprotocol/sdk` client to connect to a self-hosted Notion MCP server over StreamableHTTP, with full session negotiation and tool discovery (not a hand-rolled API wrapper)
- 🧹 **Noise filtering** — a two-layer defense against hallucination: a regex pre-filter strips greetings, reactions, and one-word replies before any AI call, and the prompt itself explicitly instructs the model to ignore banter and never invent updates
- 📅 **Full-day message coverage** — pulls every message since midnight (with pagination), not just a fixed recent window, so no volunteer's early update gets pushed out by a busy channel
- ⏰ **Daily auto-scheduler** — set once with `/standup config 17:00`, runs every weekday automatically
- 📋 **Notion sync** — every volunteer update logged automatically with date, channel, and blocker status
- 🎨 **Rich Block Kit UI** — clean digest with volunteer counts, blocker alerts, and a direct Notion button
- 👋 **Smart onboarding** — bot introduces itself when added to a channel
- 💬 **Slash commands** — full control via `/standup help`, `/standup check`, `/standup config`, `/standup status`
- 👥 **Multi-volunteer support** — separate standup entry per volunteer automatically
- 🛡️ **Graceful fallback** — falls back to the direct Notion API if the MCP layer is ever unreachable, so a standup never silently fails
- 🌐 **Production-ready deployment** — runs 24/7 on Render free tier with a lightweight health check server for port binding

---

## Tech Stack

| Layer | Technology | Cost |
|---|---|---|
| Platform | Slack Bolt (Node.js) | Free |
| AI Engine | Groq API — LLaMA 3.3 70B | Free |
| MCP Client | `@modelcontextprotocol/sdk` (official) | Free |
| MCP Server | Notion MCP Server (StreamableHTTP) | Free |
| Project Board | Notion API | Free |
| Scheduler | node-cron | Free |
| Hosting | Render | Free |

**Total infrastructure cost: $0** — making this accessible to any nonprofit worldwide.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                 Slack Workspace              │
│  Volunteers chat → @StandupSense triggered  │
└──────────────────────┬──────────────────────┘
                       │ Slack Events API
                       ▼
┌─────────────────────────────────────────────┐
│         StandupSense Bot (Node.js)           │
│         Slack Bolt + Socket Mode             │
│  ┌─────────────────────────────────────┐    │
│  │  Noise filter → per-user grouping   │    │
│  └─────────────────────────────────────┘    │
└──────────┬───────────────────┬──────────────┘
           │                   │
           ▼                   ▼
┌──────────────────┐  ┌────────────────────────┐
│   Groq AI API     │  │  MCP Client (SDK)      │
│ LLaMA 3.3 70B     │  │  StreamableHTTPClient  │
│                   │  │  Transport             │
│ Extracts:         │  └───────────┬────────────┘
│ ✅ Completed      │              │ JSON-RPC 2.0
│ 🔨 Working on     │              ▼
│ 🚧 Blockers       │  ┌────────────────────────┐
└──────────────────┘  │   Notion MCP Server    │
                       │   (subprocess, HTTP)   │
                       └───────────┬────────────┘
                                   ▼
                       ┌────────────────────────┐
                       │    Notion Database     │
                       │  Living record of all  │
                       │  volunteer work        │
                       └────────────────────────┘
```

---

## Required Hackathon Technology

✅ **MCP Server Integration** — StandupSense connects to a self-hosted Notion MCP server using the official MCP SDK client (`Client` + `StreamableHTTPClientTransport`). The integration performs real protocol-level session negotiation, dynamic tool discovery via `tools/list`, and tool invocation via `tools/call` — confirmed working end-to-end with verified Notion page creation responses.

---

## Setup

### Prerequisites
- Node.js v18+
- Slack workspace (free)
- Groq account — console.groq.com (free)
- Notion account — notion.so (free)

### Installation

```bash
git clone https://github.com/parthilbarot30/standupsense
cd standupsense
npm install
```

### Environment Variables

```env
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_SIGNING_SECRET=your-secret
SLACK_APP_TOKEN=xapp-your-token
GROQ_API_KEY=your-groq-key
NOTION_TOKEN=your-notion-token
NOTION_DATABASE_ID=your-database-id
NOTION_MCP_PORT=3001
PORT=3000
```

### Slack App Scopes

```
channels:history
channels:read
chat:write
chat:write.public
commands
reactions:read
users:read
```

### Events

```
app_mention
member_joined_channel
```

### Notion Database Columns

| Column | Type |
|---|---|
| Name | Title |
| Completed | Text |
| Working On | Text |
| Blocker | Text |
| Date | Date |
| Channel | Text |

Connect your Notion integration to the database via **"..." → Connections**.

### Run Locally

```bash
node index.js
```

The bot will automatically spawn the Notion MCP server as a subprocess, establish an MCP client session, and connect to Slack via Socket Mode — all from a single command.

### Deploy to Render (24/7 hosting, free)

1. Push this repo to GitHub
2. Create a new Web Service on [render.com](https://render.com), connect the repo
3. Build command: `npm install`
4. Start command: `node index.js`
5. Add all environment variables above in the Render dashboard
6. Deploy — the built-in health check server makes the service production-ready on Render's free tier

---

## Usage

| Command | Description |
|---|---|
| `@StandupSense check` | Run a standup right now |
| `/standup check` | Run via slash command |
| `/standup config 17:00` | Schedule daily auto-standup |
| `/standup config off` | Disable auto-standup |
| `/standup status` | Check current config |
| `/standup help` | Show all commands |

---

## Reliability Notes

- **Noise filtering**: messages matching common non-work patterns (greetings, reactions, emoji-only, links-only, very short replies) are filtered before reaching the AI, reducing hallucination risk in busy channels
- **Token protection**: each volunteer's input is capped at their 25 most recent qualifying messages
- **Fallback path**: if the MCP server is temporarily unreachable, the bot automatically falls back to a direct Notion API call so a standup is never lost
- **Full-day coverage**: messages are fetched from midnight onward with pagination, not a fixed recent-message window, so high-traffic channels don't push out a volunteer's earlier update

---

## Social Impact

**Who this helps:** Education nonprofits, volunteer tutoring programs, after-school initiatives, literacy organizations, community learning centers

**The impact:**
- Program directors get real-time visibility into volunteer activity — for free
- Resource blockers are surfaced instantly before they affect students
- A permanent, searchable record of volunteer impact is built automatically
- Zero tech overhead for volunteers — they just talk normally in Slack

**Why it matters:** The organizations that need coordination tools the most are the ones that can least afford them. StandupSense gives them enterprise-grade coordination at zero cost.

---

## Author

**Parthil Barot** — B.Tech Computer Science, Nirma University, Ahmedabad

---

*Built for the Slack Agent Builder Hackathon — "Slack Agent for Good" Track*