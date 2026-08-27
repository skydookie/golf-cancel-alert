import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30일

interface SessionPayload {
  userId: string;
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET 환경변수가 설정되지 않았습니다.");
  }
  return secret;
}

export function signSessionToken(userId: string): string {
  return jwt.sign({ userId } satisfies SessionPayload, getSessionSecret(), {
    expiresIn: SESSION_TTL_SECONDS,
  });
}

/** 서명이 유효하지 않거나 만료된 토큰이면 null을 반환한다(예외를 던지지 않음). */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, getSessionSecret());
    if (typeof decoded === "object" && decoded && "userId" in decoded) {
      return { userId: String((decoded as SessionPayload).userId) };
    }
    return null;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_COOKIE_MAX_AGE = SESSION_TTL_SECONDS;

/** Route Handler(app/api/**)에서 로그인한 User의 id를 얻는다. 없으면 null. */
export function getUserIdFromRequest(request: NextRequest): string | null {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token)?.userId ?? null;
}

/** 서버 컴포넌트/서버 액션 등 next/headers의 cookies()가 쓰이는 컨텍스트용. */
export function getUserIdFromCookieStore(): string | null {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token)?.userId ?? null;
}
