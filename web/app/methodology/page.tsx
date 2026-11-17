import type { Metadata } from "next";
import config from "../../../config/savings.json";

export const metadata: Metadata = { title: "Methodology and data sources" };

const inr = (value: number) => `₹${value.toLocaleString("en-IN")}`;

export default function Methodology() {
  const general = config.subsidy.general;
  const steps = [
    ["Boundary", "We look up the pincode's boundary. If no official polygon is available we use a rectangle around it and label the result approximate."],
    ["Footprints", `We read every building outline inside it from the open Google-Microsoft-OSM Open Buildings dataset and drop roofs under ${config.min_footprint_m2} m², which fit less than 2 kW.`],
    ["Shortlist", `We keep the ${config.shortlist_size} largest roofs.`],
    ["Roof check", `For each one, Google's Solar API gives the panel-usable area and sunshine hours. Where it has no data, usable area is taken as ${config.fallback_usable_fraction * 100}% of the footprint and marked estimated.`],
    ["Address and type", "Google reverse geocoding gives the postal address. A public business listing within 30 m marks the roof as commercial or institutional; otherwise it is treated as residential."],
    ["Savings", "We size the system, estimate yearly units and rupees saved, subtract any subsidy, and rank by yearly saving."],
  ];
  const assumptions: [string, string][] = [
    ["Roof area per kW", `${config.area_per_kw_m2} m² (about 100 sq ft)`],
    ["Yearly generation", `Solar API sunshine hours × ${config.sunshine_performance_ratio} where available, else ${config.default_yield_kwh_per_kw.toLocaleString("en-IN")} units per kW`],
    ["Residential tariff", `${inr(config.tariff_inr_per_unit.default.residential)} per unit`],
    ["Commercial tariff", `${inr(config.tariff_inr_per_unit.default.commercial)} per unit`],
    ["Installed cost", `${inr(config.cost_per_kw_inr)} per kW`],
    ["Residential subsidy (PM Surya Ghar)", `${inr(general.slabs[0].inr_per_kw)} per kW for the first ${general.slabs[0].up_to_kw} kW, ${inr(general.slabs[1].inr_per_kw)} for the third, capped at ${inr(general.cap_inr)}`],
    ["Commercial subsidy", "None"],
    ["Residential size cap", `${config.residential_cap_kw} kW`],
    ["Range shown", `Plus or minus ${config.range_fraction * 100}%`],
  ];
  return (
    <article className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Methodology and data sources</h1>
        <p className="mt-2 text-slate-600">
          Every figure on this site is an estimate, not a quotation. A site visit by an installer decides the real design and price.
        </p>
      </header>

      <section>
        <h2 className="text-xl font-semibold">How a pincode is scanned</h2>
        <ol className="mt-3 space-y-3">
          {steps.map(([title, text], index) => (
            <li key={title} className="flex gap-3">
              <span className="tabular mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-xs text-white">{index + 1}</span>
              <p><span className="font-medium">{title}.</span> <span className="text-slate-700">{text}</span></p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Savings formula</h2>
        <p className="mt-3 text-slate-700">
          System size (kW) = usable roof area ÷ {config.area_per_kw_m2} m², rounded to the nearest {config.kw_rounding_step} kW.
          Saving per year = kW × yearly units per kW × tariff. Payback = (system cost − subsidy) ÷ saving per year.
        </p>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <tbody>
              {assumptions.map(([label, value]) => (
                <tr key={label} className="border-b border-line/70 last:border-0">
                  <th scope="row" className="px-4 py-2 text-left font-medium">{label}</th>
                  <td className="px-4 py-2 text-slate-700">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Tariffs and installed cost are approximate national defaults. Special category states receive a higher subsidy.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Data sources</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-700">
          <li>
            Building footprints:{" "}
            <a className="underline" href="https://source.coop/vida/google-microsoft-osm-open-buildings">Google-Microsoft-OSM Open Buildings</a>{" "}
            by VIDA, under the Open Database License. Contains data © OpenStreetMap contributors, Google and Microsoft.
          </li>
          <li>Roof area, usable panel area and sunshine: Google Solar API.</li>
          <li>Addresses: Google Geocoding API. Business details: Google Places API, fetched when you open a row and not stored.</li>
          <li>Subsidy rules: PM Surya Ghar Muft Bijli Yojana guidelines for residential consumers.</li>
        </ul>
      </section>
    </article>
  );
}
