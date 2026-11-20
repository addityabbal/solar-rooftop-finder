// Shared helpers for the Pages Functions. Files starting with "_" are not routes.

export interface Env {
  RESULTS: KVNamespace;
  DB: D1Database;
  /** owner/name of the GitHub repo whose build-pincode workflow builds new pincodes. */
  GH_REPO?: string;
  /** Fine-grained token: this repo only, "Actions: write". Set with `wrangler pages secret put GH_TOKEN`. */
  GH_TOKEN?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  DAILY_BUILD_CAP?: string;
}

export const PIN = /^[1-9][0-9]{5}$/;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}
