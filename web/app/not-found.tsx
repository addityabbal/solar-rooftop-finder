import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-2xl font-semibold">That is not a valid pincode or page</h1>
      <p className="mt-2 text-slate-600">Indian pincodes have six digits and do not start with 0.</p>
      <Link href="/" className="mt-6 inline-block font-medium underline">
        Search a pincode
      </Link>
    </div>
  );
}
