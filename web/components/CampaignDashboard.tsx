"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatInrShort, TYPE_LABEL } from "@/lib/format";
import { formatRoofId } from "@/lib/roofId";
import type { Booking, BuildingType, CampaignEvent, EventType } from "@/lib/types";

interface RoofSummary {
  id: string;
  rank: number;
  address: string | null;
  lat: number;
  lng: number;
  building_type: BuildingType;
  kw: number;
  saving_per_year: number;
}

interface Props {
  pincode: string;
  roofs: RoofSummary[];
  events: CampaignEvent[];
  bookings: Booking[];
  mailingEnabled: boolean;
  installer: string | null;
}

const TABS = ["Activity", "Prospects", "Postcards", "Bookings"] as const;
type Tab = (typeof TABS)[number];

// Pipeline order: a roof's stage is the furthest step it has reached.
const STAGES: { type: EventType; label: string }[] = [
  { type: "scanned", label: "Scanned" },
  { type: "solar_ready", label: "Solar-ready" },
  { type: "economics_calculated", label: "Economics calculated" },
  { type: "microsite_live", label: "Microsite live" },
  { type: "visual_drawn", label: "Visual drawn" },
  { type: "postcard_generated", label: "Postcard generated" },
  { type: "mailed", label: "Mailed" },
  { type: "qr_opened", label: "QR opened" },
  { type: "booked", label: "Booked" },
];
const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.type, s.label])) as Record<EventType, string>;

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const roofLabel = (roof: RoofSummary | undefined) =>
  roof ? `#${roof.rank} ${roof.address ?? `near ${roof.lat.toFixed(5)}, ${roof.lng.toFixed(5)}`}` : "Unknown roof";

export default function CampaignDashboard({ pincode, roofs, events, bookings, mailingEnabled, installer }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Activity");
  const [notice, setNotice] = useState<string | null>(null);

  // Keep the log live.
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [router]);

  const roofById = useMemo(() => new Map(roofs.map((r) => [r.id, r])), [roofs]);
  const typesByRoof = useMemo(() => {
    const map = new Map<string, Map<EventType, number>>();
    for (const event of events) {
      const counts = map.get(event.roof_id) ?? new Map<EventType, number>();
      counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
      map.set(event.roof_id, counts);
    }
    return map;
  }, [events]);

  const roofsWith = (type: EventType) => roofs.filter((r) => typesByRoof.get(r.id)?.has(type)).length;
  const postcards = roofsWith("postcard_generated");
  const opened = roofsWith("qr_opened");
  const bookedRoofs = new Set(bookings.map((b) => b.roof_id)).size;
  const funnel: [string, string][] = [
    ["Prospects", String(roofs.length)],
    ["Postcards generated", String(postcards)],
    ["Mailed", String(roofsWith("mailed"))],
    ["QR opened", String(opened)],
    ["Bookings", String(bookings.length)],
    ["Postcard to booking", postcards ? `${Math.round((bookedRoofs / postcards) * 100)}%` : "n/a"],
  ];

  const stageOf = (roofId: string) => {
    const types = typesByRoof.get(roofId);
    return [...STAGES].reverse().find((s) => types?.has(s.type))?.label ?? "Not started";
  };

  async function markPosted(roofId: string) {
    setNotice(null);
    const response = await fetch(`/api/campaigns/mail/${formatRoofId(pincode, roofId)}`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) setNotice(body.error ?? "Could not mark as posted.");
    router.refresh();
  }

  const cell = "px-3 py-2";
  const head = "px-3 py-2 text-left font-medium";
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {funnel.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-white p-3">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="tabular mt-1 text-2xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      {(!mailingEnabled || !installer) && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Demo mode: {mailingEnabled ? "" : "mailing is switched off, so postcards are download-only. "}
          {installer ? "" : "No installer is named, so cards print as demonstration cards."}
        </p>
      )}

      <div role="tablist" aria-label="Campaign views" className="flex gap-1 border-b border-line">
        {TABS.map((name) => (
          <button
            key={name}
            role="tab"
            type="button"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === name ? "border-sun text-ink" : "border-transparent text-slate-500 hover:text-ink"
            }`}
          >
            {name}
            {name === "Bookings" && bookings.length > 0 && <span className="tabular ml-1 text-slate-500">({bookings.length})</span>}
          </button>
        ))}
      </div>

      {notice && <p role="alert" className="text-sm text-red-700">{notice}</p>}

      <div role="tabpanel" className="overflow-x-auto rounded-2xl border border-line bg-white">
        {tab === "Activity" && (
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-line bg-slate-50 text-xs text-slate-600">
              <tr><th className={head}>When</th><th className={head}>Step</th><th className={head}>Roof</th></tr>
            </thead>
            <tbody>
              {events.slice(0, 300).map((event, index) => (
                <tr key={index} className="border-b border-line/70 last:border-0">
                  <td className={`${cell} tabular whitespace-nowrap text-slate-500`}>{when(event.created_at)}</td>
                  <td className={`${cell} font-medium`}>{STAGE_LABEL[event.type] ?? event.type}</td>
                  <td className={`${cell} max-w-[360px] truncate`}>{roofLabel(roofById.get(event.roof_id))}</td>
                </tr>
              ))}
              {events.length === 0 && <tr><td colSpan={3} className="px-3 py-10 text-center text-slate-500">No activity yet. Re-run the scan to log its steps.</td></tr>}
            </tbody>
          </table>
        )}

        {tab === "Prospects" && (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line bg-slate-50 text-xs text-slate-600">
              <tr><th className={head}>Roof</th><th className={head}>Type</th><th className={`${head} text-right`}>kW</th><th className={`${head} text-right`}>Saving / yr</th><th className={head}>Stage</th><th className={head}>Microsite</th></tr>
            </thead>
            <tbody>
              {roofs.map((roof) => (
                <tr key={roof.id} className="border-b border-line/70 last:border-0">
                  <td className={`${cell} max-w-[280px] truncate`}>{roofLabel(roof)}</td>
                  <td className={cell}>{TYPE_LABEL[roof.building_type]}</td>
                  <td className={`${cell} tabular text-right`}>{roof.kw}</td>
                  <td className={`${cell} tabular text-right`}>{formatInrShort(roof.saving_per_year)}</td>
                  <td className={cell}>{stageOf(roof.id)}</td>
                  <td className={cell}><Link className="underline" href={`/r/${formatRoofId(pincode, roof.id)}`} target="_blank">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "Postcards" && (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line bg-slate-50 text-xs text-slate-600">
              <tr><th className={head}>Roof</th><th className={head}>Postcard</th><th className={head}>Status</th><th className={`${head} text-right`}>QR opens</th><th className={head}>Post</th></tr>
            </thead>
            <tbody>
              {roofs.map((roof) => {
                const types = typesByRoof.get(roof.id);
                const mailed = types?.has("mailed");
                return (
                  <tr key={roof.id} className="border-b border-line/70 last:border-0">
                    <td className={`${cell} max-w-[280px] truncate`}>{roofLabel(roof)}</td>
                    <td className={cell}>
                      <a className="underline" href={`/api/campaigns/postcards/${formatRoofId(pincode, roof.id)}`} onClick={() => setTimeout(() => router.refresh(), 1500)}>
                        Download PDF
                      </a>
                    </td>
                    <td className={cell}>{mailed ? "Mailed" : types?.has("postcard_generated") ? "Generated" : "Not generated"}</td>
                    <td className={`${cell} tabular text-right`}>{types?.get("qr_opened") ?? 0}</td>
                    <td className={cell}>
                      {mailed ? "Done" : mailingEnabled ? (
                        <button type="button" onClick={() => markPosted(roof.id)} className="rounded-lg border border-ink px-2 py-0.5 text-xs font-medium hover:bg-ink hover:text-white">Mark as posted</button>
                      ) : <span className="text-slate-400">Off (demo)</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {tab === "Bookings" && (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line bg-slate-50 text-xs text-slate-600">
              <tr><th className={head}>Name</th><th className={head}>Phone</th><th className={head}>Roof</th><th className={head}>Consent given</th></tr>
            </thead>
            <tbody>
              {bookings.map((booking, index) => (
                <tr key={index} className="border-b border-line/70 last:border-0">
                  <td className={`${cell} font-medium`}>{booking.name}</td>
                  <td className={`${cell} tabular`}>{booking.phone}</td>
                  <td className={`${cell} max-w-[280px] truncate`}>{roofLabel(roofById.get(booking.roof_id))}</td>
                  <td className={`${cell} tabular whitespace-nowrap`} title={booking.consent_text}>{when(booking.consent_at)}</td>
                </tr>
              ))}
              {bookings.length === 0 && <tr><td colSpan={4} className="px-3 py-10 text-center text-slate-500">No bookings yet. They appear here when someone submits the form on a roof&apos;s microsite.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
