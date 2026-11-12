// A stand-in for the Vibez.now API: decides every request with `decision`
// on the first status check (or at creation, for "auto").
import { createServer } from "node:http";

export async function mockApi(decision) {
  const seen = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    seen.push({ method: req.method, url: req.url, key: req.headers["x-api-key"], body: body && JSON.parse(body) });
    const send = (code, json) => res.writeHead(code, { "Content-Type": "application/json" }).end(JSON.stringify(json));
    if (decision === "error") return send(500, { error: "boom" });
    if (req.method === "POST") return send(201, { request_id: "r1", status: decision === "auto" ? "approved" : "pending" });
    if (decision === "never") return send(200, { status: "pending" });
    send(200, { status: decision === "reject" ? "rejected" : "approved", rejection_reason: decision === "reject" ? "not today" : null });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, seen, close: () => server.close() };
}
