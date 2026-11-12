import { test } from "node:test";
import assert from "node:assert/strict";

import { createClient } from "../index.js";
import { mockApi } from "./mock-api.js";

for (const [decision, expected] of [
  ["approve", true],
  ["auto", true],
  ["reject", false],
  ["error", false],
]) {
  test(`askHuman: ${decision} → ${expected}`, async () => {
    const api = await mockApi(decision);
    try {
      const client = createClient({ apiKey: "k", apiUrl: api.url });
      assert.equal(await client.askHuman({ title: "Run: ls", detail: "ls", agentName: "bot" }), expected);
      if (decision !== "error") {
        assert.equal(api.seen[0].key, "k");
        assert.equal(api.seen[0].body.code_snippet, "ls");
        assert.deepEqual(api.seen[0].body.metadata, { agent_name: "bot" });
      }
    } finally {
      api.close();
    }
  });
}

test("askHuman without a key is not approved, and calls nothing", async () => {
  const api = await mockApi("approve");
  try {
    const client = createClient({ apiKey: "", apiUrl: api.url });
    assert.equal(await client.askHuman({ title: "x" }), false);
    assert.equal(api.seen.length, 0);
  } finally {
    api.close();
  }
});

test("askHuman gives up as not approved when nobody answers in time", async () => {
  const api = await mockApi("never");
  try {
    const client = createClient({ apiKey: "k", apiUrl: api.url });
    assert.equal(await client.askHuman({ title: "x", timeoutMinutes: 0.06 }), false);
  } finally {
    api.close();
  }
});
