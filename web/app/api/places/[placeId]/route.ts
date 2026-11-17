import { NextResponse } from "next/server";
import { getScan } from "@/lib/store";

/**
 * Public business contact for one commercial rooftop, fetched from Google on view.
 * Nothing here is stored. The place must belong to a rooftop in the named scan, so this
 * route cannot be used as an open Places proxy.
 */
export async function GET(request: Request, { params }: { params: Promise<{ placeId: string }> }) {
  const { placeId } = await params;
  const pincode = new URL(request.url).searchParams.get("pincode") ?? "";
  const key = process.env.GOOGLE_SERVER_KEY;
  if (!key) return NextResponse.json({ error: "Contact lookup is not configured." }, { status: 503 });

  const scan = await getScan(pincode);
  const roof = scan?.rooftops.find((r) => r.place_id === placeId && r.building_type !== "residential");
  if (!roof) return NextResponse.json({ error: "Unknown place." }, { status: 404 });

  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    cache: "no-store",
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "displayName,nationalPhoneNumber,websiteUri,googleMapsUri",
    },
  });
  if (!response.ok) {
    return NextResponse.json({ error: "Google has no public listing for this place right now." }, { status: 502 });
  }
  const place = (await response.json()) as {
    displayName?: { text?: string };
    nationalPhoneNumber?: string;
    websiteUri?: string;
    googleMapsUri?: string;
  };
  return NextResponse.json(
    {
      name: place.displayName?.text ?? null,
      phone: place.nationalPhoneNumber ?? null,
      website: place.websiteUri ?? null,
      mapsUrl: place.googleMapsUri ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
