# vibez-approval

Make an AI agent wait for a person before it does something it can't take back.

The agent files a request. It shows up on your [Vibez.now](https://vibez.now) Requests page and in the iOS app. The agent carries on only once you approve. A rejection, an expired request, a network error or a missing key all count as **not approved**, so a failure never lets the action through.

Get an API key from Settings in Vibez.now and set it as `VIBEZ_API_KEY`.

## As an MCP server

Works with any MCP client: Claude Code, Claude Desktop, Cursor, and others.

```sh
claude mcp add vibez-approval -e VIBEZ_API_KEY=your-key -- npx -y vibez-approval
```

For clients configured with JSON:

```json
{
  "mcpServers": {
    "vibez-approval": {
      "command": "npx",
      "args": ["-y", "vibez-approval"],
      "env": { "VIBEZ_API_KEY": "your-key" }
    }
  }
}
```

Tools:

- **`request_approval`** `{ title, detail?, reason?, expires_in_minutes?, wait_seconds? }`: asks a person, then waits up to `wait_seconds` for an answer (default 50, maximum 600).
- **`check_approval`** `{ request_id, wait_seconds? }`: reads the decision, waiting while it's still pending.

MCP clients time out long tool calls. If nobody has answered within `wait_seconds`, the result is `pending` with a `request_id` and tells the agent not to proceed. The agent calls `check_approval` to keep waiting. Every result also carries `structuredContent`: `{ request_id, status, approved, reason }`.

To name the agent for auto-approve rules, set `VIBEZ_AGENT_NAME`.

## As a library

```js
import { askHuman } from "vibez-approval";

if (await askHuman({ title: "Run: rm -rf build", detail: "rm -rf build" })) {
  // approved
}
```

`createClient({ apiKey, apiUrl, sandbox })` returns the same function plus three lower-level calls:

- `submit` files a request.
- `status` reads it.
- `waitFor` polls until it's decided.

Set `sandbox: true` (or `VIBEZ_SANDBOX=1`) to exercise the API without creating anything. Sandbox requests stay pending.

## Examples

[`examples/`](https://github.com/aw3-technology/vibez-approval/tree/main/examples) in the GitHub repo has runnable versions of each guide below:

- a Claude Code `PreToolUse` hook (`claude-code/approve-bash.py`);
- a Vercel AI SDK tool (`ai-sdk/approved-shell-tool.ts`);
- a standard-library Python helper, with LangChain and OpenAI Agents SDK agents (`python/`);
- a plain Node script (`ask-before-running.mjs`).

## Guides

- [Claude Code hooks](https://vibez.now/blog/claude-code-approval-hook)
- [Vercel AI SDK](https://vibez.now/blog/vercel-ai-sdk-human-approval)
- [LangChain and LangGraph](https://vibez.now/blog/langchain-langgraph-human-approval)
- [OpenAI Agents SDK](https://vibez.now/blog/openai-agents-sdk-human-approval)
- [API reference](https://vibez.now/api-docs)

Node 18 or later. Built by [AW3 Technology, Inc.](https://aw3.tech)
