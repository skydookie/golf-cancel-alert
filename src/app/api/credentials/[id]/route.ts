import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { encryptSecret } from "@/lib/crypto";

const patchSchema = z.object({
  loginId: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
});

function toPublicShape(c: {
  id: string;
  facilityId: string;
  status: string;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    facilityId: c.facilityId,
    status: c.status,
    lastError: c.lastError,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

async function loadOwned(id: string, userId: string) {
  const credential = await prisma.facilityCredential.findUnique({ where: { id } });
  if (!credential || credential.userId !== userId) return null;
  return credential;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return jsonError("로그인이 필요합니다.", 401);

  const credential = await loadOwned(params.id, userId);
  if (!credential) return jsonError("등록된 골프장 계정을 찾을 수 없습니다.", 404);

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "요청 형식이 올바르지 않습니다.", 400);
  }
  const { loginId, password } = parsed.data;
  if (!loginId && !password) {
    return jsonError("변경할 아이디 또는 비밀번호를 입력하세요.", 400);
  }

  // 자격증명을 갱신하면, 로그인 실패로 일시중지되어 있던 감시를 다음 스캔 주기부터 재개한다.
  const updated = await prisma.facilityCredential.update({
    where: { id: params.id },
    data: {
      ...(loginId ? { encryptedLoginId: encryptSecret(loginId) } : {}),
      ...(password ? { encryptedPassword: encryptSecret(password) } : {}),
      status: "ACTIVE",
      lastError: null,
    },
  });
  return NextResponse.json(toPublicShape(updated));
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return jsonError("로그인이 필요합니다.", 401);

  const credential = await loadOwned(params.id, userId);
  if (!credential) return jsonError("등록된 골프장 계정을 찾을 수 없습니다.", 404);

  await prisma.facilityCredential.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
