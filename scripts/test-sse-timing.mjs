/**
 * SSE timing test — measures time between each SSE event
 * Usage: node scripts/test-sse-timing.mjs
 */

const API_BASE = "http://localhost:5174";

// Get auth token — try localStorage equivalent or guest
async function getAuthToken() {
  const url = `${API_BASE}/api/auth/guest`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      credentials: "include",
    });
    if (resp.ok) {
      const data = await resp.json();
      return data.data?.accessToken;
    }
  } catch {}
  return null;
}

async function main() {
  const token = await getAuthToken();
  if (!token) {
    console.error("Failed to get auth token");
    process.exit(1);
  }

  const body = {
    prompt: "周末带朋友去杭州玩一天，喜欢自然风景和美食",
    city: "杭州",
    startPoint: "杭州东站",
    date: "2026-06-07",
    time: "morning",
    budget: 300,
    mode: "leisure",
    travelStyle: ["nature", "food"],
    groupSize: 3,
    transportMode: "transit",
    modelMode: "flash",
  };

  console.log("=".repeat(60));
  console.log("SSE Timing Test");
  console.log("=".repeat(60));
  console.log(`Target: ${API_BASE}/api/agent/plan/stream`);
  console.log(`Body: ${JSON.stringify(body, null, 2)}`);
  console.log("=".repeat(60));

  const startTime = Date.now();
  let firstEventTime = null;
  let eventCount = 0;

  try {
    const response = await fetch(`${API_BASE}/api/agent/plan/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      credentials: "include",
    });

    if (!response.ok) {
      console.error(`HTTP ${response.status}`);
      const err = await response.text();
      console.error(err);
      process.exit(1);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
          continue;
        }
        if (line === "") continue;
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          const elapsed = Date.now() - startTime;
          // Check special markers first before event-type checks
          if (data === "[DONE]") {
            console.log(`[${elapsed}ms] [DONE]`);
          } else if (data.startsWith("[FINAL_RESULT]")) {
            console.log(`[${elapsed}ms] [FINAL_RESULT]`);
          } else if (currentEvent === "status") {
            const msg = JSON.parse(data).message;
            console.log(`[${elapsed}ms] event:status → "${msg}"`);
          } else if (currentEvent === "candidates") {
            const d = JSON.parse(data);
            console.log(`[${elapsed}ms] event:candidates → activities:${d.activities} restaurants:${d.restaurants} cafes:${d.cafes} events:${d.events}`);
          } else if (currentEvent === "partial_plan") {
            const d = JSON.parse(data);
            console.log(`[${elapsed}ms] event:partial_plan → "${d.title}" (${d.stepsCount} steps)`);
          } else if (currentEvent === "actions") {
            const d = JSON.parse(data);
            console.log(`[${elapsed}ms] event:actions → ${d.count} actions`);
          } else if (currentEvent === "final") {
            console.log(`[${elapsed}ms] event:final → plan complete`);
          } else if (data.startsWith("{") && JSON.parse(data).content) {
            console.log(`[${elapsed}ms] content chunk → "${JSON.parse(data).content.slice(0, 50)}..."`);
          }

          if (!firstEventTime) firstEventTime = elapsed;
          eventCount++;
        }
      }
    }

    console.log("=".repeat(60));
    console.log(`Total events: ${eventCount}`);
    console.log(`First event: ${firstEventTime}ms`);
    console.log(`Total time: ${Date.now() - startTime}ms`);
    console.log("=".repeat(60));

    if (firstEventTime > 3000) {
      console.warn("⚠️  First event took > 3s — consider optimizing initial LLM call");
    } else if (firstEventTime > 1000) {
      console.warn("⚠️  First event took > 1s — acceptable but could be faster");
    } else {
      console.log("✅ First event under 1s — good UX");
    }
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
