import { NextResponse } from "next/server";
import { findRoof, installerName, listEvents, logEvent, mailingEnabled } from "@/lib/campaign";

/**
 * Record that a postcard was handed to the post. Off unless MAILING_ENABLED=true.
 * There is no print-and-post API wired in (see docs/MAILING.md): posting is a manual
 * hand-off at a post office, and this route only logs it.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ roofId: string }> }) {
  const { roofId } = await params;
  if (!mailingEnabled()) {
    return NextResponse.json({ error: "Mailing is switched off. Postcards are download-only in demo mode." }, { status: 403 });
  }
  if (!installerName()) {
    return NextResponse.json({ error: "Set CAMPAIGN_INSTALLER_NAME first: a posted card must name who makes the visit." }, { status: 409 });
  }
  const found = await findRoof(roofId);
  if (!found) return NextResponse.json({ error: "Unknown roof." }, { status: 404 });
  const { scan, roof } = found;
  if (!roof.address) return NextResponse.json({ error: "This roof has no postal address." }, { status: 409 });

  const types = (await listEvents(scan.pincode)).filter((e) => e.roof_id === roof.id).map((e) => e.type);
  if (!types.includes("postcard_generated")) {
    return NextResponse.json({ error: "Download the postcard before marking it as posted." }, { status: 409 });
  }
  if (!types.includes("mailed")) await logEvent(scan.pincode, roof.id, "mailed", { method: "manual hand-off" });
  return NextResponse.json({ ok: true });
}
