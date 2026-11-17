import { NextResponse } from "next/server";
import { addBooking, CONSENT_TEXT, findRoof, logEvent } from "@/lib/campaign";
import { withinDailyLimit } from "@/lib/ratelimit";

/** Save a site-visit booking. Requires the visitor's own explicit consent. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { roofId?: unknown; name?: unknown; phone?: unknown; consent?: unknown }
    | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone : "";
  if (name.length < 2 || name.length > 80) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (!/^[6-9][0-9]{9}$/.test(phone)) {
    return NextResponse.json({ error: "Enter a 10-digit Indian mobile number." }, { status: 400 });
  }
  if (body?.consent !== true) {
    return NextResponse.json({ error: "Consent is required before we can save your details." }, { status: 400 });
  }
  const found = typeof body.roofId === "string" ? await findRoof(body.roofId) : null;
  if (!found) return NextResponse.json({ error: "Unknown roof." }, { status: 404 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await withinDailyLimit("booking", ip, 5))) {
    return NextResponse.json({ error: "Too many bookings from this connection today." }, { status: 429 });
  }

  try {
    await addBooking({
      pincode: found.scan.pincode,
      roof_id: found.roof.id,
      name,
      phone,
      consent_text: CONSENT_TEXT,
      consent_at: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Bookings are not available right now. Please try again later." }, { status: 503 });
  }
  // The event log never carries the name or phone.
  await logEvent(found.scan.pincode, found.roof.id, "booked");
  return NextResponse.json({ ok: true }, { status: 201 });
}
