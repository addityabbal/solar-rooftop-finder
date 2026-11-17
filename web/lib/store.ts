/** Server only. Reads scans from Supabase when configured, else from data/scans/*.json. */
import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { bundledScans } from "./bundledData";
import { isValidPincode } from "./pincode";
import type { Rooftop, Scan } from "./types";

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const hasSupabase = Boolean(supabaseUrl && supabaseKey);

export async function supabase(pathAndQuery: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${supabaseUrl}/rest/v1${pathAndQuery}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: supabaseKey!,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

async function readLocal(pincode: string): Promise<Scan | null> {
  try {
    const file = path.join(process.cwd(), "data", "scans", `${pincode}.json`);
    return JSON.parse(await fs.readFile(file, "utf8")) as Scan;
  } catch {
    // Deployed on Cloudflare there are no project files: use the scans bundled at build time.
    return bundledScans[pincode] ?? null;
  }
}

export async function getScan(pincode: string, withRooftops = true): Promise<Scan | null> {
  if (!isValidPincode(pincode)) return null;
  if (!hasSupabase) {
    const scan = await readLocal(pincode);
    return scan ? { ...scan, rooftops: withRooftops ? (scan.rooftops ?? []) : [] } : null;
  }
  const response = await supabase(`/scans?pincode=eq.${pincode}&select=*`);
  if (!response.ok) throw new Error(`Could not read scan (${response.status})`);
  const [scan] = (await response.json()) as Scan[];
  if (!scan) return readLocal(pincode);
  let rooftops: Rooftop[] = [];
  if (withRooftops && scan.status === "completed") {
    const rows = await supabase(`/rooftops?pincode=eq.${pincode}&select=*&order=rank.asc`);
    if (!rows.ok) throw new Error(`Could not read rooftops (${rows.status})`);
    rooftops = (await rows.json()) as Rooftop[];
  }
  return { ...scan, rooftops };
}

export async function queueScan(pincode: string): Promise<void> {
  const response = await supabase("/scans?on_conflict=pincode", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      pincode,
      status: "queued",
      progress: "Waiting for the scanner to start",
      error: null,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`Could not queue scan (${response.status})`);
}
