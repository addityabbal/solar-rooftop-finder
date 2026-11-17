import Link from "next/link";
import PincodeForm from "@/components/PincodeForm";
import showcase from "../../config/showcase.json";

const outputs = [
  ["Roof area", "Total and panel-usable area in sq ft for each building."],
  ["Address", "Postal address of the roof. Business contact only where a public listing exists."],
  ["Savings", "System size, units and rupees saved per year, subsidy and payback."],
];

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl py-8 sm:py-16">
      <p className="text-sm font-medium uppercase tracking-wider text-sun-deep">For solar installers in India</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
        Find the rooftops worth a site visit.
      </h1>
      <p className="mt-4 text-lg text-slate-600">
        Type one pincode. Get its 50 largest rooftops, ranked by how much solar would save each year.
      </p>

      <div className="mt-8">
        <PincodeForm />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Ready to view:</span>
        {showcase.pincodes.map((item) => (
          <Link
            key={item.pincode}
            href={`/p/${item.pincode}`}
            className="rounded-full border border-line bg-white px-3 py-1 hover:border-sun"
          >
            <span className="tabular font-medium">{item.pincode}</span>
            <span className="text-slate-500"> · {item.label}</span>
          </Link>
        ))}
      </div>

      <dl className="mt-14 grid gap-6 sm:grid-cols-3">
        {outputs.map(([title, text]) => (
          <div key={title} className="border-t-2 border-sun pt-3">
            <dt className="font-semibold">{title}</dt>
            <dd className="mt-1 text-sm text-slate-600">{text}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
