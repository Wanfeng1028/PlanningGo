/* eslint-disable no-console */
import autocannon from "autocannon";
import { parseArgs } from "node:util";

const BASE_URL = process.env.LOAD_TARGET_URL || "http://localhost:3001";

const { values } = parseArgs({
  options: {
    path: { type: "string", default: "/api/agent/plan" },
    method: { type: "string", default: "POST" },
    duration: { type: "string", default: "10" },
    connections: { type: "string", default: "10" },
  },
  strict: false,
});

const url = `${BASE_URL}${values.path}`;
const duration = Number(values.duration);
const connections = Number(values.connections);
const method = (values.method || "POST").toUpperCase();

const instance = autocannon({
  url,
  method,
  connections,
  duration,
  headers: { "content-type": "application/json" },
  ...(method === "POST"
    ? {
        body: JSON.stringify({
          prompt: "周六带娃去哪玩，亲子活动",
          traceId: `load-${Date.now()}`,
        }),
      }
    : {}),
});

autocannon.track(instance, { renderProgressBar: true });

instance.on("done", (result) => {
  console.log(`\n--- Load Test Done: ${result.title || url} ---`);
  console.log(`Requests:  ${result.requests.total}`);
  console.log(`Throughput:${result.throughput.total} bytes`);
  console.log(`Latency avg:${result.latency.average}ms  p99:${result.latency.p99}ms`);
  console.log(`Errors:    ${result.errors}`);
  console.log(`Timeouts:  ${result.timeouts}`);
});

process.once("SIGINT", () => instance.stop());
