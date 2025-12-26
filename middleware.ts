import { NextResponse, type NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

const ID_TOKEN_COOKIE_NAME = "pp_id_token";
const GOOGLE_JWKS_URL = new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
);
const jwks = createRemoteJWKSet(GOOGLE_JWKS_URL);

function isPublicPath(pathname: string) {
  if (pathname === "/login") return true;
  // Needed so unauthenticated users can establish/clear the session cookie.
  if (pathname === "/app/api/auth/session") return true;
  if (pathname === "/app/api/auth/logout") return true;
  return false;
}

async function isAuthed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(ID_TOKEN_COOKIE_NAME)?.value;
  if (!token) return false;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return false;

  try {
    await jwtVerify(token, jwks, {
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
    });
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const authed = await isAuthed(req);

  if (pathname === "/login") {
    if (authed) {
      const url = req.nextUrl.clone();
      url.pathname = "/app";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!authed) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next internals/static assets.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};

