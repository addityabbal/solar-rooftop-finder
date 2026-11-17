"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isValidPincode } from "@/lib/pincode";

export default function PincodeForm({ initial = "", compact = false }: { initial?: string; compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValidPincode(value)) {
      setError("Enter a six-digit pincode. The first digit cannot be 0.");
      return;
    }
    router.push(`/p/${value}`);
  }

  return (
    <form onSubmit={submit} noValidate className="w-full">
      <div className="flex gap-2">
        <label htmlFor="pincode" className="sr-only">
          Pincode
        </label>
        <input
          id="pincode"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          placeholder="e.g. 380015"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "pincode-error" : undefined}
          onChange={(event) => {
            setValue(event.target.value.replace(/\D/g, ""));
            setError(null);
          }}
          className={`tabular min-w-0 flex-1 rounded-xl border border-line bg-white px-4 tracking-widest outline-none focus:border-sun focus:ring-4 focus:ring-sun/20 ${
            compact ? "py-2 text-base" : "py-3 text-lg"
          }`}
        />
        <button
          type="submit"
          className={`rounded-xl bg-ink px-5 font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-sun/30 ${
            compact ? "py-2 text-sm" : "py-3"
          }`}
        >
          Find rooftops
        </button>
      </div>
      {error && (
        <p id="pincode-error" role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
