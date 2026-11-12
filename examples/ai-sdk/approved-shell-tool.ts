// An AI SDK tool that waits for your approval on Vibez.now before it runs.
//
//   npm i ai zod
//   VIBEZ_API_KEY=… AI_GATEWAY_API_KEY=… npx tsx examples/ai-sdk/approved-shell-tool.ts
//
// Written for AI SDK 7. Its own `toolApproval` option suits a person sitting
// in the chat; this is for when they aren't — the request reaches the Vibez.now
// Requests page and phone, and the tool waits. Anything but an approval, a
// network error included, means the command does not run.

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

const API = process.env.VIBEZ_API_URL ?? "https://vibez.now/api";
const sh = promisify(exec);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.VIBEZ_API_KEY ?? "",
      ...init.headers,
    },
  });
  if (res.status === 429) {
    // Over 60 calls a minute: wait as long as the server says.
    await sleep(Number(res.headers.get("retry-after") ?? 10) * 1000);
    return call(path, init);
  }
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

/** True only if a person approved within `minutes`. */
export async function askHuman(title: string, detail: string, minutes = 30): Promise<boolean> {
  try {
    const created = await call("/submit-request", {
      method: "POST",
      body: JSON.stringify({
        title: title.slice(0, 255),
        code_snippet: detail,
        source: "ai-sdk-agent",
        expires_in_minutes: minutes,
      }),
      headers: { "x-idempotency-key": `ai-sdk:${detail}:${Math.floor(Date.now() / 60_000)}` },
    });
    // An auto-approve rule can approve the request as it is created.
    let status = created.status;
    const deadline = Date.now() + minutes * 60_000;
    for (let delay = 3_000; status === "pending" && Date.now() < deadline; ) {
      await sleep(delay);
      delay = Math.min(delay * 1.5, 30_000);
      ({ status } = await call(`/check-status?request_id=${created.request_id}`));
    }
    return status === "approved";
  } catch {
    return false;
  }
}

export const runCommand = tool({
  description: "Run a shell command. A person approves every command before it runs.",
  inputSchema: z.object({ command: z.string().describe("The shell command to run") }),
  execute: async ({ command }) => {
    if (!(await askHuman(`Run: ${command.slice(0, 80)}`, command))) {
      return `Not approved: "${command}" was not run.`;
    }
    const { stdout, stderr } = await sh(command);
    return { stdout, stderr };
  },
});

const { text } = await generateText({
  model: "anthropic/claude-sonnet-5-5",
  tools: { runCommand },
  stopWhen: stepCountIs(5),
  prompt: "How much disk space is free here?",
});
console.log(text);
