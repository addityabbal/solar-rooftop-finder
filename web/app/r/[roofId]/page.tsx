import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BookingForm from "@/components/BookingForm";
import RoofVisual from "@/components/RoofVisual";
import { bookingsAvailable, CONSENT_TEXT, findRoof, installerName } from "@/lib/campaign";
import { formatInr, formatInrShort, formatNumber, toSqft } from "@/lib/format";
import { drawRoof } from "@/lib/roofVisual";

export const dynamic = "force-dynamic";
// One page per building: keep it out of search engines.
export const metadata: Metadata = { title: "Your roof's solar numbers", robots: { index: false, follow: false } };

export default async function RoofMicrosite({ params }: { params: Promise<{ roofId: string }> }) {
  const { roofId } = await params;
  const found = await findRoof(roofId);
  if (!found) notFound();
  const { roof } = found;
  const installer = installerName();
  const where = roof.address ?? `the roof near ${roof.centroid_lat.toFixed(5)}, ${roof.centroid_lng.toFixed(5)}`;

  const numbers: [string, string, string][] = [
    ["System size", `${roof.kw} kW`, `on ${formatNumber(toSqft(roof.usable_area_m2))} sq ft of usable roof`],
    ["Subsidy", roof.subsidy > 0 ? formatInr(roof.subsidy) : "None", roof.subsidy > 0 ? "PM Surya Ghar, residential" : "central subsidy is residential only"],
    ["Payback", roof.payback_years === null ? "n/a" : `About ${roof.payback_years.toFixed(1)} years`, `net cost ${formatInrShort(roof.net_cost)}`],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <p className="text-sm text-slate-500">For the owner of {where}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Your roof could save about <span className="tabular text-sun-deep">{formatInrShort(roof.saving_per_year)}</span> a year.
        </h1>
        <p className="mt-2 text-slate-600">
          Likely between {formatInrShort(roof.saving_low)} and {formatInrShort(roof.saving_high)}, from about{" "}
          {formatNumber(roof.units_per_year)} units of solar power a year.
        </p>
      </header>

      <RoofVisual drawing={drawRoof(roof)} />

      <dl className="grid gap-3 sm:grid-cols-3">
        {numbers.map(([label, value, note]) => (
          <div key={label} className="rounded-2xl border border-line bg-white p-4">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="tabular mt-1 text-xl font-semibold">{value}</dd>
            <dd className="text-xs text-slate-500">{note}</dd>
          </div>
        ))}
      </dl>

      <p className="text-sm text-slate-600">
        Estimate, not a quotation. We measured the roof outline from open building data
        {roof.estimated ? " and assumed half of it can carry panels" : " and used Google's roof data for the usable area"}.{" "}
        <Link href="/methodology" className="underline">How we calculate this</Link>.
      </p>

      {!bookingsAvailable() ? (
        <div className="rounded-2xl border border-dashed border-line bg-white p-5">
          <h2 className="text-lg font-semibold">Book a free site visit</h2>
          <p className="mt-2 text-sm text-slate-600">
            This is a demonstration. In a live campaign the owner books a site visit here with their name, mobile number and an
            explicit consent tick. The form is switched off in this demo, so no personal details are collected.
          </p>
        </div>
      ) : (
        <>
          {!installer && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Demonstration campaign: no installer is attached yet, so nobody will call. Bookings are recorded to show how the flow works.
            </p>
          )}
          <BookingForm roofId={roofId} consentText={CONSENT_TEXT} />
        </>
      )}
      {installer && <p className="text-sm text-slate-600">Site visits are carried out by {installer}.</p>}
    </div>
  );
}
