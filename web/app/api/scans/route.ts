import { NextResponse } from "next/server";
import { isValidPincode } from "@/lib/pincode";
import { checkScanAllowed } from "@/lib/ratelimit";
import { getScan, hasSupabase, queueScan } from "@/lib/store";

/** Start a scan for a new pincode: queue a row, then trigger the GitHub Actions worker. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { pincode?: unknown } | null;
  const pincode = body?.pincode;
  if (!isValidPincode(pincode)) {
    return NextResponse.json({ error: "Enter a six-digit Indian pincode." }, { status: 400 });
  }

  const existing = await getScan(pincode, false);
  if (existing && existing.status !== "failed") {
    return NextResponse.json({ status: existing.status, progress: existing.progress ?? null });
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!hasSupabase || !token || !repo) {
    return NextResponse.json(
      {
        error:
          "Live scanning is not switched on for this deployment, so only pre-scanned pincodes are available.",
      },
      { status: 503 },
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const refusal = await checkScanAllowed(ip);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 429 });

  await queueScan(pincode);
  const dispatch = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ event_type: "scan", client_payload: { pincode } }),
  });
  if (!dispatch.ok) {
    return NextResponse.json({ error: "Could not start the scanner. Please try again later." }, { status: 502 });
  }
  return NextResponse.json({ status: "queued", progress: "Waiting for the scanner to start" }, { status: 202 });
}
