import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { isValidInviteCode } from "@/lib/inviteCode";
import { signSessionToken } from "@/lib/auth";
import { jsonError, setSessionCookie } from "@/lib/api-helpers";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
  inviteCode: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "요청 형식이 올바르지 않습니다.", 400);
  }
  const { email, password, inviteCode } = parsed.data;

  // 초대코드 없이는 가입 불가
  if (!isValidInviteCode(inviteCode)) {
    return jsonError("유효하지 않은 초대코드입니다.", 403);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return jsonError("이미 가입된 이메일입니다.", 409);
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash },
  });

  const token = signSessionToken(user.id);
  const response = NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  return setSessionCookie(response, token);
}
