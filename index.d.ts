export interface ClientOptions {
  /** Defaults to VIBEZ_API_KEY. */
  apiKey?: string;
  /** Defaults to VIBEZ_API_URL, then https://vibez.now/api. */
  apiUrl?: string;
  /** Exercise the API without creating anything. Defaults to VIBEZ_SANDBOX=1. */
  sandbox?: boolean;
}

export interface ApprovalRequest {
  /** What the person sees first. Up to 255 characters. */
  title: string;
  /** The exact command, query or payload. */
  detail?: string;
  description?: string;
  /** Where the request came from; auto-approve rules can match on it. */
  source?: string;
  /** Names the agent for auto-approve rules (metadata.agent_name). */
  agentName?: string;
  /** After this, an unanswered request is rejected as expired. Default 30. */
  expiresInMinutes?: number;
  /** The same key within a short window returns the same request. */
  idempotencyKey?: string;
}

export type Status = "pending" | "approved" | "rejected";

export interface Client {
  submit(request: ApprovalRequest): Promise<{ id: string; status: Status }>;
  status(id: string): Promise<{ id: string; status: Status; reason: string | null }>;
  /** Polls until decided or waitMs passes. Never throws; errors come back as status "error". */
  waitFor(
    id: string,
    waitMs: number,
    first?: Status,
  ): Promise<{ id: string; status: Status | "error"; reason: string | null }>;
  /** True only if a person approved within timeoutMinutes (default 30). */
  askHuman(request: ApprovalRequest & { timeoutMinutes?: number }): Promise<boolean>;
}

export function createClient(options?: ClientOptions): Client;
export function askHuman(request: ApprovalRequest & { timeoutMinutes?: number }): Promise<boolean>;
