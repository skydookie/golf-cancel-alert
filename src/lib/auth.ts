import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30일
const ALG = "HS256";

interface SessionPayload {
  userId: string;
}

// jose는 Node/Edge 양쪽 런타임에서 동작한다. jsonwebtoken은 Node 'crypto'에 의존해
// 미들웨어(Edge Runtime)에서 조용히 실패하므로 쓰지 않는다.
function getSessionKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET 환경변수가 설정되지 않았습니다.");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(userId: string): Promise<string> {
  return new SignJWT({ userId } satisfies SessionPayload)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS)
    .sign(getSessionKey());
}

/** 서명이 유효하지 않거나 만료된 토큰이면 null을 반환한다(예외를 던지지 않음). */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionKey(), { algorithms: [ALG] });
    if (typeof payload.userId === "string") {
      return { userId: payload.userId };
    }
    return null;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_COOKIE_MAX_AGE = SESSION_TTL_SECONDS;

/** Route Handler(app/api/**)에서 로그인한 User의 id를 얻는다. 없으면 null. */
export async function getUserIdFromRequest(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return (await verifySessionToken(token))?.userId ?? null;
}

/** 서버 컴포넌트/서버 액션 등 next/headers의 cookies()가 쓰이는 컨텍스트용. */
export async function getUserIdFromCookieStore(): Promise<string | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return (await verifySessionToken(token))?.userId ?? null;
}
