import { NextResponse, type NextRequest } from "next/server";

/**
 * The campaign dashboard shows bookings (names and phone numbers), so it sits behind a
 * password: HTTP Basic auth, any username, password = CAMPAIGN_ADMIN_PASSWORD.
 * With no password set it is open on your own machine, and in production only while no
 * database is configured (so no bookings can exist).
 */
export function middleware(request: NextRequest) {
  const password = process.env.CAMPAIGN_ADMIN_PASSWORD;
  if (!password) {
    // Without Supabase a deployed app cannot hold bookings, so the dashboard has no personal
    // data and can be public as a demo. Once bookings can exist, a password is required.
    if (process.env.NODE_ENV !== "production" || !process.env.SUPABASE_URL) return NextResponse.next();
    return new NextResponse("Campaign dashboard is not configured.", { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      if (decoded.slice(decoded.indexOf(":") + 1) === password) return NextResponse.next();
    } catch {
      // fall through to the challenge
    }
  }
  return new NextResponse("Password required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Campaigns", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/campaigns/:path*", "/api/campaigns/:path*"] };
