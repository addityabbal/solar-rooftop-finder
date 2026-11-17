/** Server only. Daily counters in Upstash Redis. Disabled when Upstash is not configured. */
import "server-only";

const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const PER_IP_DAILY = 3;
export const GLOBAL_DAILY = 20;

async function increment(key: string): Promise<number> {
  const response = await fetch(`${url}/pipeline`, {
    method: "POST",
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, 86400],
    ]),
  });
  if (!response.ok) throw new Error(`Rate limiter unavailable (${response.status})`);
  const [{ result }] = (await response.json()) as { result: number }[];
  return result;
}

/** Returns null when the scan may proceed, otherwise a polite reason. */
export async function checkScanAllowed(ip: string): Promise<string | null> {
  if (!url || !token) return null;
  const day = new Date().toISOString().slice(0, 10);
  if ((await increment(`scan:ip:${ip}:${day}`)) > PER_IP_DAILY) {
    return `You have used today's ${PER_IP_DAILY} new scans. Pincodes that are already scanned stay free to view; please come back tomorrow for new ones.`;
  }
  if ((await increment(`scan:global:${day}`)) > GLOBAL_DAILY) {
    return "This demo has reached its limit of new scans for today. Already-scanned pincodes still work; please try a new one tomorrow.";
  }
  return null;
}

/** Generic daily counter. True when the caller is still within the limit (or limits are off). */
export async function withinDailyLimit(name: string, ip: string, max: number): Promise<boolean> {
  if (!url || !token) return true;
  const day = new Date().toISOString().slice(0, 10);
  return (await increment(`${name}:ip:${ip}:${day}`)) <= max;
}
