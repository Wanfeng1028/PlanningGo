/* eslint-disable no-console */
import autocannon from "autocannon";

const BASE_URL = process.env.LOAD_TARGET_URL || "http://localhost:3001";
const duration = Number(process.env.LOAD_DURATION || "15");

function requestFactory() {
  const traceId = `flow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return [
    {
      method: "POST",
      path: "/api/agent/plan",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "周六带娃去哪玩，亲子活动", traceId }),
    },
    {
      method: "GET",
      path: "/api/health",
      headers: {},
      body: undefined,
    },
  ];
}

const setupClient = (_client) => {
  const requests = requestFactory();
  return { requests };
};

const instance = autocannon({
  url: BASE_URL,
  duration,
  connections: 10,
  amount: 100,
  pipelining: 2,
  requests: requestFactory(),
});

autocannon.track(instance, { renderProgressBar: true });

instance.on("done", (result) => {
  console.log(`\n--- Flow Load Test Done ---`);
  console.log(`Requests:  ${result.requests.total}`);
  console.log(`Latency avg:${result.latency.average}ms  p99:${result.latency.p99}ms`);
  console.log(`Errors:    ${result.errors}`);
  console.log(`Timeouts:  ${result.timeouts}`);
});

process.once("SIGINT", () => instance.stop());
