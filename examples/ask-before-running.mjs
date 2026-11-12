// Route an agent's risky shell command through Vibez.now approval.
//
//   VIBEZ_API_KEY=… node examples/ask-before-running.mjs "rm -rf ./build"
//
// The command is submitted as a request, shows up on your Requests page and
// phone, and runs only if you approve it. Rejected or expired means it never
// runs. Add VIBEZ_SANDBOX=1 to exercise the API without creating a request
// (sandbox requests stay "pending", so the script stops after one check).
// Node 18+, no dependencies.

import { execSync } from "node:child_process";

const API = process.env.VIBEZ_API_URL ?? "https://vibez.now/api";
const KEY = process.env.VIBEZ_API_KEY;
const SANDBOX = process.env.VIBEZ_SANDBOX === "1";
const command = process.argv.slice(2).join(" ");

if (!KEY || !command) {
  console.error('Usage: VIBEZ_API_KEY=… node examples/ask-before-running.mjs "<command>"');
  process.exit(2);
}

const headers = {
  "Content-Type": "application/json",
  "x-api-key": KEY,
  ...(SANDBOX ? { "x-sandbox": "true" } : {}),
};

async function call(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const body = await res.json().catch(() => ({}));
  if (res.status === 429) {
    // Over 60 calls a minute: wait as long as the server says, then retry.
    await sleep(Number(res.headers.get("retry-after") ?? 10) * 1000);
    return call(path, init);
  }
  if (!res.ok) throw new Error(`${path}: ${res.status} ${body.error ?? ""}`.trim());
  return body;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const { request_id: id } = await call("/submit-request", {
  method: "POST",
  body: JSON.stringify({
    title: `Run: ${command.slice(0, 80)}`,
    description: `An agent on ${process.env.HOSTNAME ?? "this machine"} wants to run this command.`,
    code_snippet: command,
    source: "ask-before-running",
    expires_in_minutes: 30,
  }),
  // One key per command per minute: a retry within the same minute gets the same request back.
  headers: { "x-idempotency-key": `run:${command}:${Math.floor(Date.now() / 60_000)}` },
});
console.log(`Waiting for approval of request ${id} …`);

// Poll gently: every 3 s at first, backing off to 30 s.
for (let delay = 3_000; ; delay = Math.min(delay * 1.5, 30_000)) {
  const { status, rejection_reason } = await call(`/check-status?request_id=${id}`);
  if (status === "approved") {
    console.log("Approved. Running.");
    execSync(command, { stdio: "inherit" });
    break;
  }
  if (status === "rejected") {
    console.log(`Not run: ${rejection_reason ?? "rejected"}.`);
    process.exit(1);
  }
  if (SANDBOX) {
    console.log("Sandbox mode: the request stays pending, so stopping here.");
    break;
  }
  await sleep(delay);
}
