import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Solar Rooftop Lead Finder", template: "%s | Solar Rooftop Lead Finder" },
  description:
    "Type an Indian pincode and get a ranked list of rooftops worth pitching solar to, with usable area, system size, yearly saving and payback.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={geist.variable}>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <header className="border-b border-line bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span aria-hidden className="inline-block h-3 w-3 rounded-full bg-sun ring-4 ring-sun/20" />
              Solar Rooftop Lead Finder
            </Link>
            <nav className="flex gap-4 text-sm text-slate-600">
              <Link href="/methodology" className="hover:text-ink">
                Methodology
              </Link>
              <Link href="/privacy" className="hover:text-ink">
                Privacy
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-line text-xs text-slate-500">
          <div className="mx-auto max-w-6xl space-y-1 px-4 py-5">
            <p>Every figure is an estimate, not a quotation. Ranges are plus or minus 15%.</p>
            <p>
              Building footprints: Google-Microsoft-OSM Open Buildings by VIDA (ODbL), containing data ©
              OpenStreetMap contributors, Google and Microsoft. Roof and business data: Google Maps Platform.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
