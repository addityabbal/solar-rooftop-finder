"use client";

import { useCallback, useMemo, useState } from "react";
import RoofMap from "@/components/RoofMap";
import { formatInr, formatInrShort, formatNumber, toSqft, TYPE_LABEL } from "@/lib/format";
import type { Rooftop, Scan } from "@/lib/types";

// Light to dark = low to high yearly saving.
const SCALE = ["#fde9b8", "#f9c66a", "#f29a2e", "#d96a12", "#a8430a"];

type SortKey = "rank" | "roof" | "usable" | "type" | "address" | "kw" | "saving" | "payback";
type TypeFilter = "all" | "business" | "residential";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "rank", label: "#", numeric: true },
  { key: "address", label: "Address" },
  { key: "type", label: "Type" },
  { key: "roof", label: "Roof sq ft", numeric: true },
  { key: "usable", label: "Usable sq ft", numeric: true },
  { key: "kw", label: "kW", numeric: true },
  { key: "saving", label: "Saving / yr", numeric: true },
  { key: "payback", label: "Payback", numeric: true },
];

function sortValue(roof: Rooftop, key: SortKey): number | string {
  switch (key) {
    case "rank": return roof.rank;
    case "roof": return roof.roof_area_m2;
    case "usable": return roof.usable_area_m2;
    case "type": return roof.building_type;
    case "address": return roof.address ?? "";
    case "kw": return roof.kw;
    case "saving": return roof.saving_per_year;
    case "payback": return roof.payback_years ?? Infinity;
  }
}

const placeLabel = (roof: Rooftop) =>
  roof.address ?? `Near ${roof.centroid_lat.toFixed(5)}, ${roof.centroid_lng.toFixed(5)}`;

function downloadCsv(pincode: string, rooftops: Rooftop[]) {
  const header = [
    "rank", "building_type", "address", "latitude", "longitude", "roof_area_sqft", "usable_area_sqft",
    "usable_area_estimated", "system_kw", "units_per_year", "saving_per_year_inr", "saving_low_inr",
    "saving_high_inr", "system_cost_inr", "subsidy_inr", "net_cost_inr", "payback_years", "note",
  ];
  const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = rooftops.map((r) =>
    [
      r.rank, r.building_type, r.address, r.centroid_lat, r.centroid_lng, toSqft(r.roof_area_m2),
      toSqft(r.usable_area_m2), r.estimated, r.kw, r.units_per_year, r.saving_per_year, r.saving_low,
      r.saving_high, r.system_cost, r.subsidy, r.net_cost, r.payback_years, "estimate, not a quotation",
    ].map(quote).join(","),
  );
  const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `solar-rooftops-${pincode}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function Results({ scan }: { scan: Scan }) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [minSqft, setMinSqft] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: "rank", ascending: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const thresholds = useMemo(() => {
    const sorted = scan.rooftops.map((r) => r.saving_per_year).sort((a, b) => a - b);
    return [0.2, 0.4, 0.6, 0.8].map((q) => sorted[Math.floor(q * (sorted.length - 1))] ?? 0);
  }, [scan.rooftops]);

  const colorFor = useCallback(
    (roof: Rooftop) => SCALE[thresholds.filter((t) => roof.saving_per_year > t).length],
    [thresholds],
  );

  const visible = useMemo(() => {
    const minimum = Number(minSqft) || 0;
    const rows = scan.rooftops.filter((roof) => {
      if (typeFilter === "residential" && roof.building_type !== "residential") return false;
      if (typeFilter === "business" && roof.building_type === "residential") return false;
      return toSqft(roof.usable_area_m2) >= minimum;
    });
    const direction = sort.ascending ? 1 : -1;
    return rows.sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : 0) * direction;
    });
  }, [scan.rooftops, typeFilter, minSqft, sort]);

  const selected = visible.find((roof) => roof.id === selectedId) ?? null;
  const totalKw = visible.reduce((sum, roof) => sum + roof.kw, 0);
  const totalSaving = visible.reduce((sum, roof) => sum + roof.saving_per_year, 0);
  const anyEstimated = scan.rooftops.some((roof) => roof.estimated);

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, ascending: !current.ascending }
        : { key, ascending: key === "rank" || key === "address" || key === "type" || key === "payback" },
    );
  }

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-3 gap-3">
        {[
          ["Roofs found", formatNumber(visible.length)],
          ["Total potential", `${formatNumber(totalKw)} kW`],
          ["Total saving / yr", formatInrShort(totalSaving)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-white p-4">
            <dt className="text-xs text-slate-500 sm:text-sm">{label}</dt>
            <dd className="tabular mt-1 text-xl font-semibold tracking-tight sm:text-3xl">{value}</dd>
          </div>
        ))}
      </dl>

      {(scan.approximate || anyEstimated) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {scan.approximate && (
            <p>Approximate boundary: this scan used a rectangle around the pincode, so some roofs may sit just outside it.</p>
          )}
          {anyEstimated && (
            <p>Rows marked &ldquo;estimated&rdquo; had no Google roof data, so usable area is taken as half the footprint.</p>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="h-72 overflow-hidden rounded-2xl border border-line sm:h-96">
            <RoofMap rooftops={visible} selectedId={selected?.id ?? null} onSelect={setSelectedId} colorFor={colorFor} />
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            <span>Lower saving</span>
            <span className="flex overflow-hidden rounded">
              {SCALE.map((color) => (
                <span key={color} className="h-3 w-7" style={{ background: color }} />
              ))}
            </span>
            <span>Higher saving per year</span>
          </div>
        </div>
        <div className="lg:col-span-2">
          <RoofDetail roof={selected} pincode={scan.pincode} />
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <fieldset>
            <legend className="mb-1 text-xs text-slate-500">Building type</legend>
            <div className="flex overflow-hidden rounded-lg border border-line bg-white text-sm">
              {([["all", "All"], ["business", "Commercial"], ["residential", "Residential"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={typeFilter === value}
                  onClick={() => setTypeFilter(value)}
                  className={`px-3 py-1.5 ${typeFilter === value ? "bg-ink text-white" : "hover:bg-slate-50"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Minimum usable area (sq ft)</span>
            <input
              inputMode="numeric"
              value={minSqft}
              placeholder="Any"
              onChange={(event) => setMinSqft(event.target.value.replace(/\D/g, ""))}
              className="tabular w-36 rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-sun"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => downloadCsv(scan.pincode, visible)}
          disabled={visible.length === 0}
          className="rounded-lg border border-ink px-4 py-1.5 text-sm font-medium hover:bg-ink hover:text-white disabled:opacity-40"
        >
          Download CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-line bg-slate-50 text-xs text-slate-600">
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={sort.key === column.key ? (sort.ascending ? "ascending" : "descending") : "none"}
                  className={`px-3 py-2 font-medium ${column.numeric ? "text-right" : "text-left"}`}
                >
                  <button type="button" onClick={() => toggleSort(column.key)} className="hover:text-ink">
                    {column.label}
                    <span aria-hidden className="ml-1 inline-block w-2">
                      {sort.key === column.key ? (sort.ascending ? "↑" : "↓") : ""}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((roof) => (
              <tr
                key={roof.id}
                onClick={() => setSelectedId(roof.id === selectedId ? null : roof.id)}
                aria-selected={roof.id === selectedId}
                className={`cursor-pointer border-b border-line/70 last:border-0 ${
                  roof.id === selectedId ? "bg-sky-50" : "hover:bg-slate-50"
                }`}
              >
                <td className="tabular px-3 py-2 text-right text-slate-500">{roof.rank}</td>
                <td className="max-w-[260px] truncate px-3 py-2" title={placeLabel(roof)}>
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: colorFor(roof) }} />
                  {placeLabel(roof)}
                </td>
                <td className="px-3 py-2">{TYPE_LABEL[roof.building_type]}</td>
                <td className="tabular px-3 py-2 text-right">{formatNumber(toSqft(roof.roof_area_m2))}</td>
                <td className="tabular px-3 py-2 text-right">
                  {formatNumber(toSqft(roof.usable_area_m2))}
                  {roof.estimated && <span className="ml-1 text-[11px] text-amber-700">estimated</span>}
                </td>
                <td className="tabular px-3 py-2 text-right">{roof.kw}</td>
                <td className="tabular px-3 py-2 text-right font-medium">{formatInrShort(roof.saving_per_year)}</td>
                <td className="tabular px-3 py-2 text-right">
                  {roof.payback_years === null ? "n/a" : `${roof.payback_years.toFixed(1)} yr`}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-10 text-center text-slate-500">
                  No rooftops match these filters. Clear the minimum area or choose All.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Estimate, not a quotation. Savings can be 15% lower or higher. Select a row to see its range, costs and subsidy.
      </p>
    </div>
  );
}

function RoofDetail({ roof, pincode }: { roof: Rooftop | null; pincode: string }) {
  if (!roof) {
    return (
      <div className="grid h-full min-h-40 place-items-center rounded-2xl border border-dashed border-line p-6 text-center text-sm text-slate-500">
        Select a roof on the map or in the table to see its numbers.
      </div>
    );
  }
  const facts: [string, string][] = [
    ["System size", `${roof.kw} kW`],
    ["Units per year", formatNumber(roof.units_per_year)],
    ["System cost", formatInr(roof.system_cost)],
    ["Subsidy", roof.subsidy > 0 ? formatInr(roof.subsidy) : "None"],
    ["Net cost", formatInr(roof.net_cost)],
    ["Payback", roof.payback_years === null ? "n/a" : `About ${roof.payback_years.toFixed(1)} years`],
    ["Roof area", `${formatNumber(toSqft(roof.roof_area_m2))} sq ft`],
    ["Usable area", `${formatNumber(toSqft(roof.usable_area_m2))} sq ft${roof.estimated ? " (estimated)" : ""}`],
  ];
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="text-xs text-slate-500">
        Rank {roof.rank} · {TYPE_LABEL[roof.building_type]}
        {roof.imagery_quality ? ` · imagery ${roof.imagery_quality}` : ""}
      </p>
      <h2 className="mt-1 text-base font-semibold leading-snug">{placeLabel(roof)}</h2>
      <p className="tabular mt-3 text-3xl font-semibold tracking-tight">{formatInr(roof.saving_per_year)}</p>
      <p className="text-sm text-slate-600">
        saved per year, likely between {formatInrShort(roof.saving_low)} and {formatInrShort(roof.saving_high)}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="tabular">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 border-t border-line pt-3 text-sm">
        {roof.building_type === "residential" ? (
          <p className="text-slate-600">Residential roof: address only. No personal contact details are collected.</p>
        ) : roof.place_id ? (
          <BusinessContact key={roof.place_id} placeId={roof.place_id} pincode={pincode} distance={roof.place_distance_m} />
        ) : (
          <p className="text-slate-600">No public business listing matched this roof.</p>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">Estimate, not a quotation.</p>
    </div>
  );
}

interface Contact {
  name: string | null;
  phone: string | null;
  website: string | null;
  mapsUrl: string | null;
}

function BusinessContact({ placeId, pincode, distance }: { placeId: string; pincode: string; distance: number | null }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [contact, setContact] = useState<Contact | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    setState("loading");
    try {
      const response = await fetch(`/api/places/${encodeURIComponent(placeId)}?pincode=${pincode}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Lookup failed.");
      setContact(body);
      setState("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Lookup failed.");
      setState("error");
    }
  }

  if (contact) {
    return (
      <div className="space-y-1">
        <p className="font-medium">{contact.name ?? "Business"}</p>
        {contact.phone ? <p><a className="underline" href={`tel:${contact.phone.replace(/\s/g, "")}`}>{contact.phone}</a></p> : <p className="text-slate-600">No public phone listed.</p>}
        {contact.website && <p><a className="break-all underline" href={contact.website} target="_blank" rel="noopener noreferrer">{contact.website}</a></p>}
        <p className="text-xs text-slate-500">
          Public listing from Google{distance !== null ? `, matched ${Math.round(distance)} m from the roof centre` : ""}.
          {contact.mapsUrl && <> <a className="underline" href={contact.mapsUrl} target="_blank" rel="noopener noreferrer">View on Google Maps</a></>}
        </p>
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={load}
        disabled={state === "loading"}
        className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {state === "loading" ? "Looking up…" : "Show business contact"}
      </button>
      {state === "error" && <p role="alert" className="mt-2 text-sm text-red-700">{message}</p>}
    </div>
  );
}
