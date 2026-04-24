import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware for Fx-Remit PWA
 * Enforces route protection by checking for the Privy session cookie.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Define Protected and Public routes
  const isProtectedRoute =
    pathname.startsWith("/home") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/history") ||
    pathname.startsWith("/send");

  // 2. Check for the Privy Session cookie
  // Privy typically stores the session in 'privy-token' or 'privy-id-token'
  const privyToken = request.cookies.get("privy-token");
  const isAuthenticated = !!privyToken;

  // 3. Logic: Redirect unauthenticated users trying to access protected routes
  if (isProtectedRoute && !isAuthenticated) {
    console.log(
      `[MIDDLEWARE] Unauthorized access attempt to ${pathname}. Redirecting to /`,
    );
    const url = new URL("/", request.url);
    // Optional: add a redirect parameter to return them later
    // url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // 4. Optimization: If already authenticated, don't let them go back to Splash
  if (pathname === "/" && isAuthenticated) {
    return NextResponse.redirect(new URL("/home", request.url));
  }

  return NextResponse.next();
}

/**
 * Configure matching routes for performance.
 * We want to run this on all page routes except for API, static files, and icons.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - icon.svg (icon file)
     * - manifest.json (PWA manifest)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|manifest.json).*)",
  ],
};
