import type { RoofDrawing } from "@/lib/roofVisual";

/** Before and after diagrams of one roof. Our own drawing, not a photo. */
export default function RoofVisual({ drawing }: { drawing: RoofDrawing }) {
  const viewBox = `0 0 ${drawing.width.toFixed(1)} ${drawing.height.toFixed(1)}`;
  const views = [
    { label: "Today", withPanels: false },
    { label: "With solar", withPanels: true },
  ];
  return (
    <figure>
      <div className="grid grid-cols-2 gap-3">
        {views.map(({ label, withPanels }) => (
          <div key={label} className="rounded-2xl border border-line bg-[#eef1ea] p-3">
            <svg viewBox={viewBox} className="aspect-[4/3] w-full" role="img" aria-label={`${label}: roof diagram`}>
              <path d={drawing.outline} fill="#d6d3cb" stroke="#0f1b2d" strokeWidth={1.5} fillRule="evenodd" vectorEffect="non-scaling-stroke" />
              {withPanels && <path d={drawing.panels} fill="#1d3a6e" stroke="#9db7e5" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />}
            </svg>
            <p className="mt-2 text-center text-sm font-medium">{label}</p>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 text-xs text-slate-500">
        Diagram of the roof outline with {drawing.panelCount.toLocaleString("en-IN")} panels
        {drawing.illustrative ? ". Layout is illustrative; an installer decides the real placement." : ", placed where Google's roof data says they fit."}
      </figcaption>
    </figure>
  );
}
