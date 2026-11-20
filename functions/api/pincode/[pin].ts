// GET /api/pincode/:pin
// 200 + result JSON when the pincode is in KV; otherwise queue one GitHub Actions build (202).
import { type Env, PIN, json } from "../../_shared";

const STALE_MINUTES = 30; // a queued/running build older than this may be retried

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const pin = String(params.pin);
  if (!PIN.test(pin)) return json({ error: "invalid pincode" }, 400);

  const hit = await env.RESULTS.get(`pin:${pin}`, "text");
  if (hit) {
    return new Response(hit, {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=86400" },
    });
  }

  if (!env.GH_TOKEN || !env.GH_REPO) {
    return json({ status: "builds_disabled", message: "New pincodes can't be built right now. Try a ready pincode." }, 503);
  }

  // Already queued or running recently? Don't trigger a second build.
  const existing = await env.DB.prepare(
    `SELECT status, COALESCE(updated_at, created_at) AS at,
            (julianday('now') - julianday(COALESCE(updated_at, created_at))) * 1440 AS age_min
     FROM build_requests WHERE pin = ?`,
  )
    .bind(pin)
    .first<{ status: string; at: string; age_min: number }>();
  if (existing && (existing.status === "queued" || existing.status === "running") && existing.age_min < STALE_MINUTES) {
    return json({ status: existing.status }, 202);
  }

  // Daily cap so a bot can't burn the free Actions/KV quota.
  const cap = Number(env.DAILY_BUILD_CAP ?? 25);
  const today = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM build_requests WHERE date(COALESCE(updated_at, created_at)) = date('now')",
  ).first<number>("n");
  if (Number(today) >= cap) return json({ status: "daily_limit" }, 429);

  await env.DB.prepare(
    `INSERT INTO build_requests(pin, status, updated_at, error) VALUES(?, 'queued', datetime('now'), NULL)
     ON CONFLICT(pin) DO UPDATE SET status = 'queued', updated_at = datetime('now'), error = NULL`,
  )
    .bind(pin)
    .run();

  const dispatch = await fetch(
    `https://api.github.com/repos/${env.GH_REPO}/actions/workflows/build-pincode.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GH_TOKEN}`,
        "User-Agent": "solar-rooftop-finder",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: "main", inputs: { pin } }),
    },
  );
  if (!dispatch.ok) {
    await env.DB.prepare("UPDATE build_requests SET status = 'failed', error = ? WHERE pin = ?")
      .bind(`dispatch HTTP ${dispatch.status}`, pin)
      .run();
    return json({ status: "failed", message: "Could not start the build. Please try again later." }, 502);
  }
  return json({ status: "queued" }, 202);
};
