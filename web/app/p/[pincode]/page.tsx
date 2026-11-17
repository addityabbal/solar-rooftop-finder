import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PincodeForm from "@/components/PincodeForm";
import Link from "next/link";
import Results from "@/components/Results";
import ScanProgress from "@/components/ScanProgress";
import { isValidPincode } from "@/lib/pincode";
import { getScan } from "@/lib/store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ pincode: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pincode } = await params;
  return {
    title: `Rooftops in ${pincode}`,
    description: `Ranked solar-ready rooftops in pincode ${pincode}, with usable area, yearly saving and payback.`,
  };
}

export default async function PincodePage({ params }: Props) {
  const { pincode } = await params;
  if (!isValidPincode(pincode)) notFound();
  const scan = await getScan(pincode);
  const completed = scan?.status === "completed";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Pincode</p>
          <h1 className="tabular text-3xl font-semibold tracking-tight">{pincode}</h1>
          {completed && scan.buildings_in_boundary != null && (
            <p className="mt-1 text-sm text-slate-600">
              Top {scan.rooftops.length} rooftops by yearly saving, out of{" "}
              {scan.buildings_in_boundary.toLocaleString("en-IN")} buildings scanned.{" "}
              <Link href={`/campaigns/${pincode}`} className="underline">Campaign view</Link>
            </p>
          )}
        </div>
        <div className="w-full sm:w-80">
          <PincodeForm compact />
        </div>
      </div>
      {completed ? <Results scan={scan} /> : <ScanProgress pincode={pincode} initialStatus={scan?.status ?? null} />}
    </div>
  );
}
