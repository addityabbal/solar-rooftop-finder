// GET /api/status/:pin -> { status: queued | running | done | failed | unknown, updated_at, error }
import { type Env, PIN, json } from "../../_shared";

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const pin = String(params.pin);
  if (!PIN.test(pin)) return json({ error: "invalid pincode" }, 400);
  const row = await env.DB.prepare(
    "SELECT status, COALESCE(updated_at, created_at) AS updated_at, error FROM build_requests WHERE pin = ?",
  )
    .bind(pin)
    .first<{ status: string; updated_at: string; error: string | null }>();
  if (!row) {
    const ready = await env.RESULTS.get(`pin:${pin}`, "text");
    return json({ status: ready ? "done" : "unknown" });
  }
  return json(row);
};
