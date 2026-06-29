# StandupSense for Education 🎓🤖

> **Zero forms. Zero effort. Automatic volunteer coordination for education nonprofits.**

StandupSense is a Slack agent built for education nonprofits and volunteer teaching organizations. Instead of asking volunteers to fill out forms or respond to bot prompts, StandupSense passively reads natural Slack conversations, uses AI to extract what every volunteer accomplished, surfaces blockers instantly, and syncs everything to Notion via MCP — giving program directors real-time visibility into their entire volunteer network.

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

## Demo

**The magic moment:** *"Nobody filled out a form. The bot wrote every volunteer's update from their normal Slack conversation — and already logged the blocker to Notion."*

---

## How It Works

```
Volunteers chat naturally in Slack throughout the day
                    ↓
      @StandupSense check (or auto at 5 PM daily)
                    ↓
      Fetches last 30 messages from channel
                    ↓
      Groups messages by volunteer
                    ↓
      Groq AI (LLaMA 3.3 70B) extracts:
      ✅ What they completed
      🔨 What they're working on
      🚧 Any resource blockers
                    ↓
      Notion MCP Server syncs to project board
                    ↓
      Rich Block Kit digest posted in Slack
      with direct link to Notion board
```

---

## Features

- 🤖 **AI-powered extraction** — Groq AI reads natural volunteer conversation and extracts structured standup data
- 🔌 **MCP server integration** — Notion MCP server handles all project sync via proper MCP protocol
- ⏰ **Daily auto-scheduler** — Set once with `/standup config 17:00`, runs every weekday automatically
- 📋 **Notion sync** — Every volunteer update logged automatically with date, channel, and blocker status
- 🎨 **Rich Block Kit UI** — Beautiful digest with volunteer counts, blocker alerts, and Notion button
- 👋 **Smart onboarding** — Bot introduces itself when added to a channel
- 💬 **Slash commands** — Full control via `/standup help`, `/standup check`, `/standup config`, `/standup status`
- 🔇 **Noise filtering** — AI ignores casual chatter, only extracts real work updates
- 👥 **Multi-volunteer support** — Separate standup entry per volunteer automatically
- 🛡️ **Graceful fallback** — Falls back to direct Notion API if MCP layer has issues

---

## Tech Stack

| Layer | Technology | Cost |
|---|---|---|
| Platform | Slack Bolt (Node.js) | Free |
| AI Engine | Groq API — LLaMA 3.3 70B | Free |
| MCP Layer | Notion MCP Server (HTTP) | Free |
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
└──────────┬───────────────────┬──────────────┘
           │                   │
           ▼                   ▼
┌──────────────────┐  ┌────────────────────────┐
│   Groq AI API    │  │  Notion MCP Server     │
│ LLaMA 3.3 70B    │  │  (HTTP on port 3001)   │
│                  │  │  JSON-RPC 2.0 Protocol │
│ Extracts:        │  └───────────┬────────────┘
│ ✅ Completed     │              │
│ 🔨 Working on    │              ▼
│ 🚧 Blockers      │  ┌────────────────────────┐
└──────────────────┘  │    Notion Database     │
                       │  Living record of all  │
                       │  volunteer work        │
                       └────────────────────────┘
```

---

## Required Hackathon Technology

✅ **MCP Server Integration** — Notion MCP Server runs as HTTP subprocess, receives JSON-RPC 2.0 calls from the bot to create Notion pages

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
NOTION_MCP_AUTH_TOKEN=standupsense-mcp-secret
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

### Run

```bash
node index.js
```

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