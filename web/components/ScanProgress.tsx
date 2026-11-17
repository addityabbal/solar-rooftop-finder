"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Status {
  status: string;
  progress?: string | null;
  error?: string | null;
}

/** Starts a scan for a new pincode (if needed) and polls until it completes. */
export default function ScanProgress({ pincode, initialStatus }: { pincode: string; initialStatus: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ status: initialStatus ?? "starting" });
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const response = await fetch(`/api/scans/${pincode}`, { cache: "no-store" });
        const body = (await response.json()) as Status;
        if (stopped) return;
        if (body.status === "completed") return router.refresh();
        if (body.status === "failed") return setProblem(body.error || "The scan failed. Please try again later.");
        setStatus(body);
      } catch {
        // Network blip: keep polling.
      }
      timer = setTimeout(poll, 4000);
    }

    async function start() {
      if (!initialStatus || initialStatus === "failed") {
        const response = await fetch("/api/scans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pincode }),
        });
        const body = await response.json().catch(() => ({}));
        if (stopped) return;
        if (!response.ok) return setProblem(body.error ?? "Could not start the scan.");
        setStatus(body);
      }
      timer = setTimeout(poll, 3000);
    }

    start().catch(() => setProblem("Could not reach the server. Check your connection and reload."));
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pincode, initialStatus, router]);

  if (problem) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">Pincode {pincode} has not been scanned</h2>
        <p role="alert" className="mt-2 text-slate-600">{problem}</p>
        <Link href="/" className="mt-4 inline-block font-medium underline">
          Back to pre-scanned pincodes
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-line bg-white p-6" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-sun" aria-hidden />
        <h2 className="text-lg font-semibold">Scanning pincode {pincode}</h2>
      </div>
      <p className="mt-2 text-slate-600">{status.progress ?? "Starting the scan"}…</p>
      <p className="mt-4 text-sm text-slate-500">
        A new pincode takes a minute or two: we find every building, keep the 50 largest roofs and check each one.
        This page updates by itself.
      </p>
    </div>
  );
}
