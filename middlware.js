// middleware.js
import { NextResponse } from "next/server";

const PASS = process.env.BASIC_AUTH_PASS || "angela1";  // fallback local

export function middleware(req) {
  // allow public assets
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const auth = req.headers.get("authorization");

  // If no header, prompt for password
  if (!auth?.startsWith("Basic ")) {
    return new NextResponse("Auth required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="WST2"' },
    });
  }

  // decode base64 password only (no username check)
  const [, base64] = auth.split(" ");
  const decoded = Buffer.from(base64, "base64").toString();
  // decoded is typically "username:password" — we ignore username
  const suppliedPassword = decoded.split(":")[1];

  if (suppliedPassword !== PASS) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
