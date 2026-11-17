"use client";

import { useState } from "react";

export default function BookingForm({ roofId, consentText }: { roofId: string; consentText: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Please enter your name.");
    if (!/^[6-9][0-9]{9}$/.test(phone)) return setError("Enter a 10-digit Indian mobile number.");
    if (!consent) return setError("Please tick the box so we are allowed to call you.");
    setState("sending");
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roofId, name: name.trim(), phone, consent }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not save your booking. Please try again.");
      setState("done");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not save your booking.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
        <p className="font-semibold">Site visit requested</p>
        <p className="mt-1 text-sm">Thank you, {name.trim()}. We will call {phone} to agree a time.</p>
      </div>
    );
  }

  const field = "mt-1 w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-sun focus:ring-4 focus:ring-sun/20";
  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-2xl border border-line bg-white p-5">
      <h2 className="text-lg font-semibold">Book a free site visit</h2>
      <label className="block text-sm">
        Your name
        <input className={field} value={name} autoComplete="name" maxLength={80} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block text-sm">
        Mobile number
        <input
          className={`${field} tabular`}
          value={phone}
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={10}
          placeholder="10 digits"
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-[#e8890c]" />
        <span>{consentText}</span>
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full rounded-xl bg-ink py-3 font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {state === "sending" ? "Sending…" : "Request my site visit"}
      </button>
      <p className="text-xs text-slate-500">We use your name and number only to arrange this visit. See the privacy page.</p>
    </form>
  );
}
