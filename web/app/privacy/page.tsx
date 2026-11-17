import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="text-lg text-slate-700">
        We hold no personal data about residents, unless a person chooses to give us their name and number to book a site visit.
      </p>
      <section className="space-y-3 text-slate-700">
        <h2 className="text-xl font-semibold text-ink">What a result contains</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>For every roof: its outline, area, postal address and a savings estimate. These describe a building, not a person.</li>
          <li>For residential roofs: address only. We never collect, infer or store the names, phone numbers or emails of private individuals.</li>
          <li>For commercial and institutional roofs: the business name, public phone and website from its Google listing, fetched live when you ask for it and not stored by us.</li>
        </ul>
      </section>
      <section className="space-y-3 text-slate-700">
        <h2 className="text-xl font-semibold text-ink">What we never do</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>We do not scrape Google Maps or any other website. All data comes from official APIs and open datasets.</li>
          <li>We do not analyse satellite or map images ourselves.</li>
          <li>We do not sell or share visitor data.</li>
        </ul>
      </section>
      <section className="space-y-3 text-slate-700">
        <h2 className="text-xl font-semibold text-ink">About you, the visitor</h2>
        <p>
          The site has no accounts and sets no advertising cookies. To keep the demo from being abused, your IP address is counted
          against a daily limit on new scans and the count is deleted after 24 hours.
        </p>
      </section>
      <section className="space-y-3 text-slate-700">
        <h2 className="text-xl font-semibold text-ink">Postcards and site-visit bookings</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>A campaign postcard is addressed to &ldquo;The Owner&rdquo; at a building&rsquo;s postal address. We do not know or look up who lives there.</li>
          <li>If you fill in the booking form, we store the name and mobile number you typed, the roof it is about, and the time you ticked the consent box. Nothing else.</li>
          <li>We use these details only to arrange that visit. They are visible only to the campaign team, behind a password.</li>
          <li>Scanning a postcard&rsquo;s QR code is counted per roof. The count holds no information about you.</li>
        </ul>
      </section>
      <p className="text-sm text-slate-500">This page describes how the product works. It is not legal advice.</p>
    </article>
  );
}
