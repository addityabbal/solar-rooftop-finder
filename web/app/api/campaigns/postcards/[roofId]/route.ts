import { NextResponse } from "next/server";
import { findRoof, installerName, listEvents, logEvent } from "@/lib/campaign";
import { buildPostcard } from "@/lib/postcard";

/** Download the print-ready postcard PDF for one roof. Behind the campaign password (see middleware). */
export async function GET(request: Request, { params }: { params: Promise<{ roofId: string }> }) {
  const { roofId } = await params;
  const found = await findRoof(roofId);
  if (!found) return NextResponse.json({ error: "Unknown roof." }, { status: 404 });
  const { scan, roof } = found;

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin).replace(/\/$/, "");
  const pdf = await buildPostcard({ roof, qrUrl: `${site}/q/${roofId}`, installer: installerName() });

  const logged = new Set((await listEvents(scan.pincode)).filter((e) => e.roof_id === roof.id).map((e) => e.type));
  if (!logged.has("visual_drawn")) await logEvent(scan.pincode, roof.id, "visual_drawn");
  if (!logged.has("postcard_generated")) await logEvent(scan.pincode, roof.id, "postcard_generated");

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="postcard-${roofId}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
