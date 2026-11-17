import { NextResponse } from "next/server";
import { isValidPincode } from "@/lib/pincode";
import { getScan } from "@/lib/store";

/** Scan status for the progress screen. */
export async function GET(_request: Request, { params }: { params: Promise<{ pincode: string }> }) {
  const { pincode } = await params;
  if (!isValidPincode(pincode)) {
    return NextResponse.json({ error: "Invalid pincode." }, { status: 400 });
  }
  const scan = await getScan(pincode, false);
  if (!scan) return NextResponse.json({ status: "missing" }, { status: 404 });
  return NextResponse.json({ status: scan.status, progress: scan.progress ?? null, error: scan.error ?? null });
}
