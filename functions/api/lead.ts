// POST /api/lead  { pin, name?, phone, monthly_bill_inr?, consent: true, turnstile_token }
// Saves an opt-in quote request. The consent text stored is exactly what the person agreed to.
import { type Env, PIN, json } from "../_shared";

export const CONSENT_TEXT =
  "I agree that my name, mobile number and monthly bill can be stored and shared with solar installers so they can call me about a quote for my roof.";

export const onRequestGet: PagesFunction<Env> = async ({ env }) =>
  json({ enabled: Boolean(env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY), siteKey: env.TURNSTILE_SITE_KEY ?? null, consentText: CONSENT_TEXT });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.TURNSTILE_SECRET_KEY) return json({ error: "Quote requests are not open yet." }, 503);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: "Invalid request." }, 400);

  const pin = String(body.pin ?? "");
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const phone = String(body.phone ?? "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  const bill = body.monthly_bill_inr === undefined || body.monthly_bill_inr === "" ? null : Number(body.monthly_bill_inr);
  if (!PIN.test(pin)) return json({ error: "Enter a valid pincode." }, 400);
  if (!/^[6-9]\d{9}$/.test(phone)) return json({ error: "Enter a 10-digit Indian mobile number." }, 400);
  if (bill !== null && (!Number.isFinite(bill) || bill < 0 || bill > 10_000_000)) {
    return json({ error: "Enter your monthly bill in rupees, or leave it empty." }, 400);
  }
  if (body.consent !== true) return json({ error: "Please tick the consent box." }, 400);

  // Cloudflare Turnstile blocks bots.
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", String(body.turnstile_token ?? ""));
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);
  const check = (await (
    await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form })
  ).json()) as { success: boolean };
  if (!check.success) return json({ error: "Human check failed. Please try again." }, 403);

  await env.DB.prepare(
    "INSERT INTO leads(pin, name, phone, monthly_bill_inr, consent_text) VALUES(?, ?, ?, ?, ?)",
  )
    .bind(pin, name || null, phone, bill === null ? null : Math.round(bill), CONSENT_TEXT)
    .run();
  return json({ ok: true }, 201);
};
