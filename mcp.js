#!/usr/bin/env node
// An MCP server that lets any MCP client's agent ask a person before it acts.
//
//   claude mcp add vibez-approval -e VIBEZ_API_KEY=… -- npx -y vibez-approval
//
// MCP clients time out long tool calls, so request_approval waits at most
// wait_seconds (default 50). If nobody has answered by then it returns
// "pending" with the request id, and check_approval keeps waiting. Only an
// explicit approval is ever reported as approved.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { createClient } from "./index.js";

const client = createClient();
const agentName = process.env.VIBEZ_AGENT_NAME;

const server = new McpServer({ name: "vibez-approval", version: "0.1.0" });

const waitSeconds = z
  .number()
  .int()
  .min(0)
  .max(600)
  .default(50)
  .describe("How long to wait for a decision before returning pending. Keep it under your client's tool timeout.");

/** One shape for every answer, so the agent never has to guess what "done" means. */
function answer({ id, status, reason }) {
  const approved = status === "approved";
  const ref = id ? ` (request ${id})` : "";
  const text = approved
    ? `Approved${ref}. Go ahead.`
    : status === "pending"
      ? `Still waiting for a person${ref}. Do not proceed; call check_approval with this request_id to keep waiting.`
      : `Not approved${ref}${reason ? `: ${reason}` : ""}. Do not proceed.`;
  return {
    content: [{ type: "text", text }],
    structuredContent: { request_id: id, status, approved, reason: reason ?? null },
    isError: status === "error",
  };
}

const result = z.object({
  request_id: z.string().nullable(),
  status: z.string(),
  approved: z.boolean(),
  reason: z.string().nullable(),
});

server.registerTool(
  "request_approval",
  {
    title: "Ask a person to approve an action",
    description:
      "Before doing anything consequential (running a command, deleting data, spending money, deploying, sending a message), ask a person on Vibez.now. They see it on the web and their phone. Proceed only if the result says approved.",
    inputSchema: {
      title: z.string().min(1).max(255).describe("One line: what you want to do."),
      detail: z.string().optional().describe("The exact command, query or payload."),
      reason: z.string().optional().describe("Why, in a sentence or two."),
      expires_in_minutes: z.number().int().min(1).max(1440).default(30),
      wait_seconds: waitSeconds,
    },
    outputSchema: result.shape,
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async ({ title, detail, reason, expires_in_minutes, wait_seconds }) => {
    try {
      const created = await client.submit({
        title,
        detail,
        description: reason,
        source: "mcp",
        agentName,
        expiresInMinutes: expires_in_minutes,
      });
      return answer(await client.waitFor(created.id, wait_seconds * 1000, created.status));
    } catch (error) {
      return answer({ id: null, status: "error", reason: error.message });
    }
  },
);

server.registerTool(
  "check_approval",
  {
    title: "Check or keep waiting on an approval",
    description: "Read a request's decision, waiting up to wait_seconds while it is still pending.",
    inputSchema: {
      request_id: z.string().min(1),
      wait_seconds: waitSeconds,
    },
    outputSchema: result.shape,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ request_id, wait_seconds }) => {
    try {
      const now = await client.status(request_id);
      return answer(await client.waitFor(request_id, wait_seconds * 1000, now.status));
    } catch (error) {
      return answer({ id: request_id, status: "error", reason: error.message });
    }
  },
);

await server.connect(new StdioServerTransport());
