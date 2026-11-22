import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: the API decides who may see what. This just avoids
// rendering the signed-in area for visitors who clearly have no session.
const PUBLIC = ["/login", "/register", "/forgot-password", "/reset-password", "/accept-invite"];
const SESSION_HINT = "bmerc_session";

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = req.cookies.has(SESSION_HINT);
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isPublic && !hasSession) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (hasSession && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // Skip the API rewrite, Next internals and static files.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.[a-z0-9]+$).*)"],
};
