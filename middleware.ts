import { NextResponse, type NextRequest } from "next/server";

/**
 * Firebase auth is client-side (`onAuthStateChanged`) in this app.
 *
 * Middleware runs on the Edge and must not invent server auth state (e.g. fake cookies).
 * Route protection is enforced by the client gate in `src/app/(protected)/layout.tsx`.
 *
 * This file exists only to explicitly keep public routes public and avoid any
 * cookie-based redirect logic that could create login redirect loops.
 */
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next internals/static assets.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};

