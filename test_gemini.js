const models = [
  "gemini-pro",
  "gemini-1.0-pro",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
];

async function testModel(modelName, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Say hello" }] }],
    }),
  });
  return res.status;
}

async function main() {
  const apiKey = process.argv[2];
  if (!apiKey) { console.log("Usage: node test_gemini.js YOUR_API_KEY"); return; }
  
  for (const m of models) {
    const status = await testModel(m, apiKey);
    console.log(`${status === 200 ? "✅" : "❌"} ${m} → ${status}`);
  }
}

main();