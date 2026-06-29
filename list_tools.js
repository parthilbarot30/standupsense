const axios = require("axios");

const MCP_BASE = "http://127.0.0.1:3001";

async function listTools() {
  try {
    // Step 1: Initialize session
    console.log("🔌 Initializing MCP session...");
    const initPayload = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "standupsense", version: "1.0.0" },
      },
    };

    const initRes = await axios.post(`${MCP_BASE}/mcp`, initPayload, {
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      timeout: 5000,
    });

    const sessionId = initRes.headers["mcp-session-id"];
    console.log("✅ Session ID:", sessionId);
    console.log("Init response:", JSON.stringify(initRes.data, null, 2));

    if (!sessionId) {
      console.log("⚠️ No session ID in headers, trying tools/list anyway...");
    }

    // Step 2: List tools
    const toolsPayload = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    };

    const toolsRes = await axios.post(`${MCP_BASE}/mcp`, toolsPayload, {
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      timeout: 5000,
    });

    const tools = toolsRes.data?.result?.tools || [];
    console.log(`\n✅ Found ${tools.length} tools:\n`);
    tools.forEach((t) =>
      console.log(`  - ${t.name}: ${t.description?.substring(0, 100) || ""}`)
    );

  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.response) {
      console.log("Status:", error.response.status);
      console.log("Data:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

listTools();