import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/auth";

const PROTECTED_PATHS = ["/schedule", "/settings"];
const AUTH_PATHS = ["/login", "/signup"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const userId = await getUserIdFromRequest(request);

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (isProtected && !userId) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p));
  if (isAuthPage && userId) {
    return NextResponse.redirect(new URL("/schedule", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/schedule/:path*", "/settings/:path*", "/login", "/signup"],
};
