import { NextResponse } from "next/server";
import { findRoof, logEvent } from "@/lib/campaign";

/** The postcard QR code points here: count the scan, then show the roof's microsite. */
export async function GET(request: Request, { params }: { params: Promise<{ roofId: string }> }) {
  const { roofId } = await params;
  const found = await findRoof(roofId);
  if (!found) return NextResponse.redirect(new URL("/", request.url));
  await logEvent(found.scan.pincode, found.roof.id, "qr_opened");
  return NextResponse.redirect(new URL(`/r/${roofId}`, request.url));
}
