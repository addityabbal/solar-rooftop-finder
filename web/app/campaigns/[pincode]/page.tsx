import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CampaignDashboard from "@/components/CampaignDashboard";
import { installerName, listBookings, listEvents, mailingEnabled } from "@/lib/campaign";
import { isValidPincode } from "@/lib/pincode";
import { getScan } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Campaign", robots: { index: false, follow: false } };

export default async function CampaignPage({ params }: { params: Promise<{ pincode: string }> }) {
  const { pincode } = await params;
  if (!isValidPincode(pincode)) notFound();
  const scan = await getScan(pincode);
  if (!scan || scan.status !== "completed") {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-line bg-white p-6">
        <h1 className="text-lg font-semibold">No campaign for {pincode} yet</h1>
        <p className="mt-2 text-slate-600">A campaign starts from a completed scan.</p>
        <Link href={`/p/${pincode}`} className="mt-4 inline-block font-medium underline">Scan this pincode</Link>
      </div>
    );
  }
  const [events, bookings] = await Promise.all([listEvents(pincode), listBookings(pincode)]);
  // Send only what the dashboard shows; footprints stay on the server.
  const roofs = scan.rooftops.map((r) => ({
    id: r.id,
    rank: r.rank,
    address: r.address,
    lat: r.centroid_lat,
    lng: r.centroid_lng,
    building_type: r.building_type,
    kw: r.kw,
    saving_per_year: r.saving_per_year,
  }));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Campaign</p>
          <h1 className="tabular text-3xl font-semibold tracking-tight">{pincode}</h1>
        </div>
        <Link href={`/p/${pincode}`} className="text-sm underline">Back to rooftop results</Link>
      </div>
      <CampaignDashboard
        pincode={pincode}
        roofs={roofs}
        events={events}
        bookings={bookings}
        mailingEnabled={mailingEnabled()}
        installer={installerName()}
      />
    </div>
  );
}
