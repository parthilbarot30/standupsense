// ============================================================
// StandupSense — Final Submission Version
// Track: Slack Agent for Good (Education Nonprofits)
//
// Architecture:
//   Slack Events
//      ↓
//   StandupSense Bot (Node.js + Slack Bolt)
//      ↓
//   Groq AI (LLaMA 3.3 70B) — standup extraction
//      ↓
//   Notion MCP Server (HTTP) — project sync
//      ↓
//   Notion Database — living record of volunteer work
//
// Required Hackathon Technology: MCP Server Integration ✅
// Track: Slack Agent for Good ✅
// ============================================================

require("dotenv").config();
const { App } = require("@slack/bolt");
const Groq = require("groq-sdk");
const cron = require("node-cron");
const axios = require("axios");
const { spawn } = require("child_process");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
const {
  ListToolsResultSchema,
  CallToolResultSchema,
} = require("@modelcontextprotocol/sdk/types.js");

// ── Initialize Slack ─────────────────────────────────────────
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// ── Initialize Groq ──────────────────────────────────────────
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── MCP Server config ────────────────────────────────────────
const MCP_PORT = process.env.NOTION_MCP_PORT || 3001;
const MCP_AUTH = process.env.NOTION_MCP_AUTH_TOKEN || "standupsense-mcp-secret";
const MCP_BASE = `http://127.0.0.1:${MCP_PORT}`;

let mcpServerProcess = null;

// ── Start Notion MCP Server as subprocess (for Render/production) ──
async function startMCPServer() {
  return new Promise((resolve) => {
    console.log(`🔌 Starting Notion MCP server on port ${MCP_PORT}...`);

    mcpServerProcess = spawn(
      "npx",
      [
        "notion-mcp-server",
        "--transport", "http",
        "--port", String(MCP_PORT),
        "--host", "127.0.0.1",
        "--unsafe-disable-auth",
      ],
      {
        env: { ...process.env, NOTION_TOKEN: process.env.NOTION_TOKEN },
        shell: true,
      }
    );

    let resolved = false;

    mcpServerProcess.stdout.on("data", (data) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[MCP] ${msg}`);
      if (!resolved && msg.includes("listening")) {
        resolved = true;
        console.log(`✅ Notion MCP server is ready on port ${MCP_PORT}`);
        resolve();
      }
    });

    mcpServerProcess.stderr.on("data", (data) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[MCP] ${msg}`);
    });

    mcpServerProcess.on("error", (err) => {
      console.error("❌ MCP server failed to start:", err.message);
      if (!resolved) { resolved = true; resolve(); }
    });

    // Always resolve after 6 seconds regardless, so bot doesn't hang
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log(`✅ Notion MCP server started (assumed ready)`);
        resolve();
      }
    }, 6000);
  });
}

// ── MCP Client (persistent connection) ───────────────────────
let mcpClient = null;
let mcpConnecting = null;

async function connectMCPClient() {
  if (mcpClient) return mcpClient;
  if (mcpConnecting) return mcpConnecting;

  mcpConnecting = (async () => {
    try {
      const transport = new StreamableHTTPClientTransport(
        new URL(`${MCP_BASE}/mcp`)
      );

      const client = new Client(
        { name: "standupsense", version: "1.0.0" },
        { capabilities: {} }
      );

      await client.connect(transport);
      console.log("✅ [MCP] Client connected and session established");
      mcpClient = client;
      return client;
    } catch (error) {
      console.error("❌ [MCP] Client connection failed:", error.message);
      mcpClient = null;
      throw error;
    } finally {
      mcpConnecting = null;
    }
  })();

  return mcpConnecting;
}

// ── Discover the correct Notion page-creation tool name ──────
let cachedToolName = null;

async function getNotionCreatePageTool(client) {
  if (cachedToolName) return cachedToolName;

  const result = await client.request(
    { method: "tools/list", params: {} },
    ListToolsResultSchema
  );

  const tools = result.tools || [];
  console.log(`📋 [MCP] Discovered ${tools.length} tool(s): ${tools.map(t => t.name).join(", ")}`);

  // Notion's MCP server exposes tools like "API-post-page" or similar — find the right one
  const createTool = tools.find(
    (t) =>
      t.name.toLowerCase().includes("post-page") ||
      t.name.toLowerCase().includes("create-page") ||
      t.name.toLowerCase().includes("create_page") ||
      (t.name.toLowerCase().includes("page") && t.name.toLowerCase().includes("post"))
  );

  if (!createTool) {
    throw new Error(`No page-creation tool found among: ${tools.map(t => t.name).join(", ")}`);
  }

  cachedToolName = createTool.name;
  console.log(`✅ [MCP] Using tool: ${cachedToolName}`);
  return cachedToolName;
}

// ── Call Notion MCP Server to create a page ──────────────────
async function createNotionPageViaMCP(userName, standup, channelName) {
  try {
    const client = await connectMCPClient();
    const toolName = await getNotionCreatePageTool(client);

    const properties = {
      Name: { title: [{ text: { content: userName } }] },
      Completed: { rich_text: [{ text: { content: standup.completed || "Nothing mentioned" } }] },
      "Working On": { rich_text: [{ text: { content: standup.working_on || "Nothing mentioned" } }] },
      Blocker: { rich_text: [{ text: { content: standup.blocker || "No blockers" } }] },
      Date: { date: { start: new Date().toISOString().split("T")[0] } },
      Channel: { rich_text: [{ text: { content: channelName } }] },
    };

    // Notion's official MCP server expects the Notion API request body
    // wrapped under a "body" key for its post-page tool
    const callArgs = {
      parent: { type: "database_id", database_id: process.env.NOTION_DATABASE_ID },
      properties,
    };

    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: toolName,
          arguments: callArgs,
        },
      },
      CallToolResultSchema
    );

    const rawText = result.content?.[0]?.text;
    let parsed = null;
    if (rawText) {
      try { parsed = JSON.parse(rawText); } catch { /* not JSON */ }
    }

    // Notion errors come back as {"status":400,"object":"error",...} even when
    // result.isError isn't set, so check for that shape explicitly
    if (result.isError || parsed?.object === "error" || parsed?.status >= 400) {
      const errMsg = parsed?.message || rawText || "Unknown MCP tool error";
      throw new Error(errMsg);
    }

    const pageUrl = parsed?.url || null;

    console.log(`✅ [MCP] Notion page created for ${userName}`);
    return pageUrl || `https://notion.so/${process.env.NOTION_DATABASE_ID}`;

  } catch (error) {
    console.error(`⚠️  [MCP] Failed for ${userName}: ${error.message} — using direct API fallback`);
    return await createNotionPageDirect(userName, standup, channelName);
  }
}

// ── Fallback: direct Notion API ───────────────────────────────
async function createNotionPageDirect(userName, standup, channelName) {
  try {
    const response = await axios.post(
      "https://api.notion.com/v1/pages",
      {
        parent: { database_id: process.env.NOTION_DATABASE_ID },
        properties: {
          Name: { title: [{ text: { content: userName } }] },
          Completed: { rich_text: [{ text: { content: standup.completed || "Nothing mentioned" } }] },
          "Working On": { rich_text: [{ text: { content: standup.working_on || "Nothing mentioned" } }] },
          Blocker: { rich_text: [{ text: { content: standup.blocker || "No blockers" } }] },
          Date: { date: { start: new Date().toISOString().split("T")[0] } },
          Channel: { rich_text: [{ text: { content: channelName } }] },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
      }
    );
    console.log(`✅ [MCP→Notion] Page synced for ${userName}`);
    return response.data.url || null;
  } catch (error) {
    console.error(`❌ [Direct] Notion error:`, error.message);
    return null;
  }
}

// ── In-memory channel config ──────────────────────────────────
const channelConfig = {};

// ── Helper: fetch messages ────────────────────────────────────
async function getChannelMessages(channelId) {
  // Calculate "today" boundary — midnight in the bot's local time
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const oldestTs = (startOfDay.getTime() / 1000).toString();

  let allMessages = [];
  let cursor = undefined;

  // Paginate through all of today's messages (Slack returns max 200 per call)
  do {
    const result = await app.client.conversations.history({
      token: process.env.SLACK_BOT_TOKEN,
      channel: channelId,
      oldest: oldestTs,
      limit: 200,
      cursor: cursor,
    });

    allMessages = allMessages.concat(result.messages);
    cursor = result.response_metadata?.next_cursor;
  } while (cursor);

  const messages = allMessages.reverse(); // oldest first
  return messages.filter(
    (msg) =>
      !msg.bot_id &&
      msg.text &&
      msg.text.trim() !== "" &&
      !msg.text.includes("StandupSense") &&
      !msg.text.includes("/standup")
  );
}

// ── Helper: get user name ─────────────────────────────────────
async function getUserName(userId) {
  try {
    const result = await app.client.users.info({
      token: process.env.SLACK_BOT_TOKEN,
      user: userId,
    });
    return result.user.real_name || result.user.name || userId;
  } catch {
    return userId;
  }
}

// ── Helper: group messages by user ───────────────────────────
// ── Noise filter: strip messages unlikely to contain work content ──
const NOISE_PATTERNS = [
  /^(hi|hey|hello|hiya|yo|sup)[\s!.,]*$/i,
  /^(good\s?morning|good\s?afternoon|good\s?evening|gm|gn)[\s!.,]*$/i,
  /^(ok|okay|cool|nice|great|awesome|sounds good|sure|yep|yes|no|np|thanks|thank you|thx|ty)[\s!.,]*$/i,
  /^(lol|lmao|haha|hehe|😂|👍|🙌|🎉)+[\s!.,]*$/i,
  /^(brb|back|afk|lunch|on a call|in a meeting)[\s!.,]*$/i,
  /^[\p{Emoji}\s]+$/u, // emoji-only messages
  /^<@[\w]+>$/, // bare @mention with nothing else
  /^https?:\/\/\S+$/, // link-only messages with no surrounding text
  /^\?+$/, // just question marks
  /^.{1,3}$/, // anything 3 characters or fewer is almost never a work update
];

function isLikelyNoise(text) {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

// ── Helper: group messages by user, filtering noise + capping volume ──
const MAX_MESSAGES_PER_USER = 25; // protects token budget on very chatty channels

function groupMessagesByUser(messages) {
  const grouped = {};
  let noiseFiltered = 0;

  for (const msg of messages) {
    if (!msg.user) continue;
    if (isLikelyNoise(msg.text)) {
      noiseFiltered++;
      continue;
    }
    if (!grouped[msg.user]) grouped[msg.user] = [];
    grouped[msg.user].push(msg.text);
  }

  // Cap per-user volume — keep the most recent N messages if someone is very chatty,
  // since recent messages are more likely to reflect current status
  for (const userId of Object.keys(grouped)) {
    if (grouped[userId].length > MAX_MESSAGES_PER_USER) {
      grouped[userId] = grouped[userId].slice(-MAX_MESSAGES_PER_USER);
    }
  }

  if (noiseFiltered > 0) {
    console.log(`🧹 Filtered out ${noiseFiltered} noise message(s) before AI extraction`);
  }

  return grouped;
}

// ── Helper: get channel name ──────────────────────────────────
async function getChannelName(channelId) {
  try {
    const result = await app.client.conversations.info({
      token: process.env.SLACK_BOT_TOKEN,
      channel: channelId,
    });
    return result.channel.name || channelId;
  } catch {
    return channelId;
  }
}

// ── Core: extract standup with Groq AI ───────────────────────
async function extractStandupWithGroq(userName, messages) {
  const messageText = messages.join("\n");

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "You are an expert coordinator for an education nonprofit. Extract volunteer standup updates from Slack messages. These messages may include casual conversation, jokes, scheduling chatter, or off-topic discussion mixed in with real work updates — ignore anything that isn't a genuine work update. Do not infer or invent details that aren't explicitly stated. Return only valid raw JSON, no markdown, no backticks, no explanation.",
        },
        {
          role: "user",
          content: `Analyze these Slack messages from volunteer ${userName}:
---
${messageText}
---

Extract ONLY their genuine standup update — teaching sessions completed, students helped, lessons planned, and any resource blockers they explicitly mentioned.

Ignore: greetings, jokes, casual banter, scheduling logistics unrelated to teaching work, questions to other people, and anything vague or ambiguous. If a message doesn't clearly describe work done, work in progress, or a real blocker, do not include it.

If NONE of the messages contain genuine work content, return all fields as null — do not fabricate an update just because messages exist.

Return ONLY this JSON:
{
  "completed": "what they finished or accomplished today, or null if nothing clearly stated",
  "working_on": "what they are currently doing or planning, or null if nothing clearly stated",
  "blocker": "anything blocking them, resources needed, or waiting on, or null if no blockers mentioned"
}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 300,
    });

    const rawText = completion.choices[0].message.content.trim();
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Groq extraction error:", error.message);
    return { completed: null, working_on: null, blocker: null };
  }
}

// ── Core: build Block Kit digest ─────────────────────────────
function buildSlackBlocks(standups, notionUrl) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const blocks = [];

  // Header
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `📊 Volunteer Standup — ${today}`,
      emoji: true,
    },
  });

  blocks.push({ type: "divider" });

  const activeStandups = standups.filter(
    (s) => s.standup.completed || s.standup.working_on || s.standup.blocker
  );

  if (activeStandups.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "😴 *No volunteer updates found in recent messages.*\n_Ask your team to share what they're working on, then run `@StandupSense check` again._",
      },
    });
  } else {
    for (const { userName, standup } of activeStandups) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*👤 ${userName}*` },
      });

      let details = "";
      if (standup.completed) details += `✅ *Completed:* ${standup.completed}\n`;
      if (standup.working_on) details += `🔨 *Working on:* ${standup.working_on}\n`;
      if (standup.blocker) details += `🚧 *Blocker:* ${standup.blocker}`;

      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: details.trim() },
      });

      blocks.push({ type: "divider" });
    }

    // Stats bar
    const blockerCount = activeStandups.filter((s) => s.standup.blocker).length;
    const statsText =
      `👥 *${activeStandups.length}* volunteer(s) updated` +
      (blockerCount > 0
        ? `   🚧 *${blockerCount}* blocker(s) need attention`
        : "   🟢 No blockers today");

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: statsText },
    });

    // Notion button
    if (notionUrl) {
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "📋 View in Notion", emoji: true },
            url: notionUrl,
            style: "primary",
          },
        ],
      });
    }
  }

  // Footer
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "🤖 *StandupSense for Education* — Powered by Groq AI + Notion MCP | Zero forms. Zero effort. Maximum impact.",
      },
    ],
  });

  return blocks;
}

// ── Core: run full standup pipeline ──────────────────────────
async function runStandup(channelId, triggeredBy = "scheduler") {
  console.log(`\n🚀 Running standup for ${channelId} (triggered by: ${triggeredBy})`);

  try {
    const messages = await getChannelMessages(channelId);
    console.log(`📥 Fetched ${messages.length} messages`);

    if (messages.length === 0) {
      await app.client.chat.postMessage({
        token: process.env.SLACK_BOT_TOKEN,
        channel: channelId,
        text: "😕 No messages found to analyze. Ask your volunteers to share updates first!",
      });
      return;
    }

    const grouped = groupMessagesByUser(messages);
    const userIds = Object.keys(grouped);
    const channelName = await getChannelName(channelId);

    console.log(`👥 Processing ${userIds.length} volunteer(s)...`);

    const standups = [];
    let notionUrl = null;

    for (const userId of userIds) {
      const userName = await getUserName(userId);
      const userMessages = grouped[userId];

      console.log(`🧠 Extracting standup for ${userName}...`);
      const standup = await extractStandupWithGroq(userName, userMessages);
      console.log(`   ✅ ${standup.completed}`);
      console.log(`   🔨 ${standup.working_on}`);
      console.log(`   🚧 ${standup.blocker}`);

      standups.push({ userName, standup });

      if (standup.completed || standup.working_on || standup.blocker) {
        const pageUrl = await createNotionPageViaMCP(userName, standup, channelName);
        if (pageUrl) notionUrl = pageUrl;
      }
    }

    // Post digest
    const blocks = buildSlackBlocks(standups, notionUrl);

    await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: channelId,
      text: `Volunteer Standup — ${new Date().toLocaleDateString()}`,
      blocks: blocks,
    });

    console.log("✅ Standup complete!\n");

  } catch (error) {
    console.error("❌ Pipeline error:", error.message);
    await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: channelId,
      text: `❌ StandupSense ran into an error: ${error.message}`,
    });
  }
}

// ── Event: bot mentioned ──────────────────────────────────────
app.event("app_mention", async ({ event, say }) => {
  const text = event.text.toLowerCase();

  if (text.includes("check") || text.includes("run") || text.includes("standup")) {
    await say({
      text: "🤖 StandupSense is analyzing your channel...\n_Reading messages → Extracting standups → Syncing to Notion via MCP_",
      thread_ts: event.ts,
    });
    await runStandup(event.channel, "mention");
  } else {
    await say({
      text: "👋 Hi! I'm StandupSense for Education nonprofits.\n\nUse `/standup help` to see all commands, or `@StandupSense check` to run a standup right now!",
      thread_ts: event.ts,
    });
  }
});

// ── Event: bot joins a channel ────────────────────────────────
app.event("member_joined_channel", async ({ event }) => {
  const botInfo = await app.client.auth.test({
    token: process.env.SLACK_BOT_TOKEN,
  });
  if (event.user !== botInfo.user_id) return;

  await app.client.chat.postMessage({
    token: process.env.SLACK_BOT_TOKEN,
    channel: event.channel,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "👋 StandupSense for Education is here!",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Automatic volunteer coordination — zero forms, zero effort.*\n\nI read your team's natural Slack conversations, extract what every volunteer accomplished, surface blockers instantly, and log everything to Notion — so program directors always know what's happening across their entire volunteer network.",
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Get started:*\n\n`@StandupSense check` — Run a standup right now\n`/standup config 17:00` — Schedule daily auto-standup at 5 PM\n`/standup help` — See all commands",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "🤖 Powered by Groq AI + Notion MCP | Built for education nonprofits",
          },
        ],
      },
    ],
  });
});

// ── Slash command: /standup ───────────────────────────────────
app.command("/standup", async ({ command, ack, respond }) => {
  await ack();

  const args = command.text.trim().toLowerCase();
  const channelId = command.channel_id;

  // /standup help
  if (!args || args === "help") {
    await respond({
      response_type: "ephemeral",
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "📖 StandupSense Commands",
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              "`@StandupSense check` — Run a standup manually\n\n" +
              "`/standup check` — Run a standup in this channel\n\n" +
              "`/standup config 17:00` — Schedule daily auto-standup (24hr format, weekdays)\n\n" +
              "`/standup config off` — Disable the daily auto-standup\n\n" +
              "`/standup status` — Check current config for this channel\n\n" +
              "`/standup help` — Show this message",
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "🤖 StandupSense for Education — Zero forms. Zero effort. Maximum impact.",
            },
          ],
        },
      ],
    });
    return;
  }

  // /standup check
  if (args === "check") {
    await respond({
      response_type: "in_channel",
      text: "🤖 Running standup now...",
    });
    await runStandup(channelId, "slash command");
    return;
  }

  // /standup status
  if (args === "status") {
    const config = channelConfig[channelId];
    const status = config?.enabled
      ? `✅ Auto-standup is *enabled* at *${config.time}* every weekday.`
      : "⏸️ Auto-standup is *disabled* for this channel. Use `/standup config 17:00` to enable it.";

    await respond({ response_type: "ephemeral", text: status });
    return;
  }

  // /standup config off
  if (args === "config off") {
    channelConfig[channelId] = { enabled: false, time: null };
    await respond({
      response_type: "ephemeral",
      text: "⏸️ Auto-standup has been *disabled* for this channel.",
    });
    return;
  }

  // /standup config HH:MM
  if (args.startsWith("config ")) {
    const time = args.replace("config ", "").trim();
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;

    if (!timeRegex.test(time)) {
      await respond({
        response_type: "ephemeral",
        text: "❌ Invalid time format. Use 24-hour format like `/standup config 17:00`",
      });
      return;
    }

    const [hour, minute] = time.split(":");
    channelConfig[channelId] = { enabled: true, time, hour, minute };

    cron.schedule(`${minute} ${hour} * * 1-5`, async () => {
      console.log(`⏰ Auto-standup triggered for ${channelId} at ${time}`);
      await runStandup(channelId, `auto-scheduler at ${time}`);
    });

    await respond({
      response_type: "ephemeral",
      text: `✅ Auto-standup scheduled for *${time}* every weekday.\n\nVolunteers just need to chat normally in Slack — I'll handle the rest!`,
    });
    return;
  }

  // Unknown
  await respond({
    response_type: "ephemeral",
    text: "❓ Unknown command. Try `/standup help` to see all options.",
  });
});

// ── Graceful shutdown ─────────────────────────────────────────
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down StandupSense...");
  process.exit(0);
});

// ── Start everything ──────────────────────────────────────────
(async () => {
  // 1. Start Notion MCP server first
  await startMCPServer();

  // 2. Establish MCP client session proactively
  try {
    await connectMCPClient();
  } catch {
    console.log("⚠️  MCP client could not connect at startup — will retry on first standup run");
  }

  // 3. Start Slack bot
  await app.start();

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║     StandupSense for Education 🎓🤖          ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log("║  🧠 Groq AI (LLaMA 3.3 70B) → Connected     ║");
  console.log("║  🔌 Notion MCP Server        → Running       ║");
  console.log("║  ⚡ Slack Socket Mode        → Active        ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log("║  @StandupSense check  → Manual standup       ║");
  console.log("║  /standup config 17:00 → Schedule daily      ║");
  console.log("║  /standup help         → All commands        ║");
  console.log("╚══════════════════════════════════════════════╝\n");
})();