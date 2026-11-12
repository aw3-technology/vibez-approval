// A client for the Vibez.now approval API.
//
// submit() files a request, which appears on the person's Requests page and
// phone; status() reads it back; askHuman() does both and waits. Every path
// that isn't an explicit approval — rejection, expiry, a network error, a
// missing key, running out of time — resolves to "not approved", so a
// failure never lets the action through.

const DEFAULT_API = "https://vibez.now/api";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {import("./index").ClientOptions} [options] */
export function createClient(options = {}) {
  const api = (options.apiUrl ?? process.env.VIBEZ_API_URL ?? DEFAULT_API).replace(/\/$/, "");
  const apiKey = options.apiKey ?? process.env.VIBEZ_API_KEY;
  const sandbox = options.sandbox ?? process.env.VIBEZ_SANDBOX === "1";

  async function call(path, init = {}, attempt = 0) {
    if (!apiKey) throw new Error("VIBEZ_API_KEY is not set");
    const res = await fetch(`${api}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        ...(sandbox ? { "x-sandbox": "true" } : {}),
        ...init.headers,
      },
    });
    if (res.status === 429 && attempt < 5) {
      // Over 60 calls a minute: wait as long as the server says.
      await sleep(Number(res.headers.get("retry-after") ?? 10) * 1000);
      return call(path, init, attempt + 1);
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${path}: ${res.status} ${body.error ?? ""}`.trim());
    return body;
  }

  /** @param {import("./index").ApprovalRequest} request */
  async function submit(request) {
    const body = await call("/submit-request", {
      method: "POST",
      body: JSON.stringify({
        title: String(request.title).slice(0, 255),
        description: request.description,
        code_snippet: request.detail,
        source: request.source ?? "vibez-approval",
        metadata: request.agentName ? { agent_name: request.agentName } : undefined,
        expires_in_minutes: request.expiresInMinutes ?? 30,
      }),
      ...(request.idempotencyKey ? { headers: { "x-idempotency-key": request.idempotencyKey } } : {}),
    });
    return { id: body.request_id, status: body.status };
  }

  /** @param {string} id */
  async function status(id) {
    const body = await call(`/check-status?request_id=${encodeURIComponent(id)}`);
    return { id, status: body.status, reason: body.rejection_reason ?? null };
  }

  /**
   * Poll until the request is decided or `waitMs` passes. Never throws:
   * an error comes back as status "error".
   */
  async function waitFor(id, waitMs, first = "pending") {
    let current = { id, status: first, reason: null };
    const deadline = Date.now() + waitMs;
    try {
      for (let delay = 3_000; current.status === "pending" && Date.now() + delay <= deadline; ) {
        await sleep(delay);
        delay = Math.min(delay * 1.5, 30_000);
        current = await status(id);
        // Sandbox requests never leave pending; don't wait out the clock.
        if (sandbox) break;
      }
    } catch (error) {
      return { id, status: "error", reason: error.message };
    }
    return current;
  }

  /** @param {import("./index").ApprovalRequest & { timeoutMinutes?: number }} request */
  async function askHuman(request) {
    const minutes = request.timeoutMinutes ?? request.expiresInMinutes ?? 30;
    try {
      const created = await submit({ ...request, expiresInMinutes: minutes });
      // An auto-approve rule can approve the request as it is created.
      const final = await waitFor(created.id, minutes * 60_000, created.status);
      return final.status === "approved";
    } catch {
      return false;
    }
  }

  return { submit, status, waitFor, askHuman };
}

/** askHuman with the environment's key: true only if a person approved. */
export const askHuman = (request) => createClient().askHuman(request);
