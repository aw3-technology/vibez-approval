import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { mockApi } from "./mock-api.js";

const server = fileURLToPath(new URL("../mcp.js", import.meta.url));

async function connect(apiUrl, apiKey = "k") {
  const client = new Client({ name: "test", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [server],
      env: { ...process.env, VIBEZ_API_URL: apiUrl, VIBEZ_API_KEY: apiKey },
    }),
  );
  return client;
}

test("lists both tools", async () => {
  const client = await connect("http://127.0.0.1:9");
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["check_approval", "request_approval"]);
  } finally {
    await client.close();
  }
});

for (const [decision, status, approved] of [
  ["approve", "approved", true],
  ["reject", "rejected", false],
  ["error", "error", false],
]) {
  test(`request_approval: ${decision}`, async () => {
    const api = await mockApi(decision);
    const client = await connect(api.url);
    try {
      const res = await client.callTool({
        name: "request_approval",
        arguments: { title: "Deploy", detail: "vercel --prod", wait_seconds: 10 },
      });
      assert.equal(res.structuredContent.status, status);
      assert.equal(res.structuredContent.approved, approved);
      assert.equal(res.content[0].text.startsWith(approved ? "Approved" : "Not approved"), true);
    } finally {
      await client.close();
      api.close();
    }
  });
}

test("returns pending with an id when the wait runs out, and check_approval picks it up", async () => {
  const api = await mockApi("never");
  const client = await connect(api.url);
  try {
    const first = await client.callTool({ name: "request_approval", arguments: { title: "Deploy", wait_seconds: 0 } });
    assert.equal(first.structuredContent.status, "pending");
    assert.equal(first.structuredContent.approved, false);
    assert.match(first.content[0].text, /Do not proceed/);
    const again = await client.callTool({
      name: "check_approval",
      arguments: { request_id: first.structuredContent.request_id, wait_seconds: 0 },
    });
    assert.equal(again.structuredContent.status, "pending");
  } finally {
    await client.close();
    api.close();
  }
});
