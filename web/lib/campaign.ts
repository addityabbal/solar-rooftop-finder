/** Server only. Campaign events and bookings: Supabase when configured, else local JSON files. */
import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { bundledEvents } from "./bundledData";
import { parseRoofId } from "./roofId";
import { getScan, hasSupabase, supabase } from "./store";
import type { Booking, CampaignEvent, EventType, Rooftop, Scan } from "./types";

export const CONSENT_TEXT =
  "I agree to be contacted by phone about a free solar site visit for this address.";

export const mailingEnabled = () => process.env.MAILING_ENABLED === "true";
export const installerName = () => process.env.CAMPAIGN_INSTALLER_NAME?.trim() || null;

const dir = () => path.join(process.cwd(), "data", "campaign");

/** Local JSON files are writable only on your own machine; a deployed app needs Supabase. */
const localWritable = () => process.env.NODE_ENV !== "production";
export const bookingsAvailable = () => hasSupabase || localWritable();

async function readJson<T>(file: string): Promise<T[]> {
  try {
    return JSON.parse(await fs.readFile(path.join(dir(), file), "utf8")) as T[];
  } catch {
    // Deployed without Supabase: pipeline events bundled at build time, nothing else.
    const events = file.endsWith(".events.json") ? bundledEvents[file.slice(0, 6)] : undefined;
    return (events ?? []) as T[];
  }
}

async function appendJson<T>(file: string, row: T): Promise<void> {
  const rows = await readJson<T>(file);
  rows.push(row);
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(path.join(dir(), file), JSON.stringify(rows), "utf8");
}

export async function findRoof(roofId: string): Promise<{ scan: Scan; roof: Rooftop } | null> {
  const parsed = parseRoofId(roofId);
  if (!parsed) return null;
  const scan = await getScan(parsed.pincode);
  const roof = scan?.status === "completed" ? scan.rooftops.find((r) => r.id === parsed.id) : undefined;
  return scan && roof ? { scan, roof } : null;
}

export async function listEvents(pincode: string): Promise<CampaignEvent[]> {
  let events: CampaignEvent[];
  if (hasSupabase) {
    const response = await supabase(`/events?pincode=eq.${pincode}&select=*&order=created_at.desc&limit=2000`);
    if (!response.ok) throw new Error(`Could not read events (${response.status})`);
    events = (await response.json()) as CampaignEvent[];
  } else {
    events = await readJson<CampaignEvent>(`${pincode}.events.json`);
  }
  return events.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Never throws: a lost log line must not break a visitor's page. */
export async function logEvent(
  pincode: string,
  roofId: string,
  type: EventType,
  meta: Record<string, unknown> = {},
): Promise<void> {
  const event: CampaignEvent = {
    pincode,
    roof_id: roofId,
    type,
    source: "web",
    created_at: new Date().toISOString(),
    meta,
  };
  try {
    if (hasSupabase) {
      const response = await supabase("/events", { method: "POST", body: JSON.stringify(event) });
      if (!response.ok) throw new Error(String(response.status));
    } else if (localWritable()) {
      await appendJson(`${pincode}.events.json`, event);
    }
  } catch (error) {
    console.error("Could not log campaign event", type, error);
  }
}

export async function listBookings(pincode: string): Promise<Booking[]> {
  if (hasSupabase) {
    const response = await supabase(`/bookings?pincode=eq.${pincode}&select=*&order=consent_at.desc`);
    if (!response.ok) throw new Error(`Could not read bookings (${response.status})`);
    return (await response.json()) as Booking[];
  }
  const rows = await readJson<Booking>(`${pincode}.bookings.json`);
  return rows.sort((a, b) => b.consent_at.localeCompare(a.consent_at));
}

export async function addBooking(booking: Booking): Promise<void> {
  if (hasSupabase) {
    const response = await supabase("/bookings", { method: "POST", body: JSON.stringify(booking) });
    if (!response.ok) throw new Error(`Could not save booking (${response.status})`);
    return;
  }
  if (!localWritable()) throw new Error("Bookings need Supabase when deployed.");
  await appendJson(`${booking.pincode}.bookings.json`, booking);
}
