import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { signSessionToken } from "@/lib/auth";
import { jsonError, setSessionCookie } from "@/lib/api-helpers";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError("요청 형식이 올바르지 않습니다.", 400);
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  // 이메일 존재 여부를 노출하지 않도록 두 실패 케이스를 동일한 메시지/상태로 처리한다.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return jsonError("이메일 또는 비밀번호가 올바르지 않습니다.", 401);
  }

  const token = signSessionToken(user.id);
  const response = NextResponse.json({ id: user.id, email: user.email });
  return setSessionCookie(response, token);
}
