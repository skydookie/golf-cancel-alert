import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { encryptSecret } from "@/lib/crypto";
import { isKnownFacilityId } from "@/lib/facilities";

const bodySchema = z.object({
  facilityId: z.string().min(1),
  loginId: z.string().min(1),
  password: z.string().min(1),
});

// 절대 암호화된/복호화된 비밀번호를 응답에 담지 않는다 — 목록 조회 등에서 상태만 보여준다.
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

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return jsonError("로그인이 필요합니다.", 401);

  const credentials = await prisma.facilityCredential.findMany({ where: { userId } });
  return NextResponse.json(credentials.map(toPublicShape));
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return jsonError("로그인이 필요합니다.", 401);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "요청 형식이 올바르지 않습니다.", 400);
  }
  const { facilityId, loginId, password } = parsed.data;

  if (!isKnownFacilityId(facilityId)) {
    return jsonError("지원하지 않는 골프장입니다.", 400);
  }

  const existing = await prisma.facilityCredential.findUnique({
    where: { userId_facilityId: { userId, facilityId } },
  });
  if (existing) {
    return jsonError(
      "이미 등록된 골프장입니다. 계정 정보를 바꾸려면 수정(PATCH)을 사용하세요.",
      409
    );
  }

  const created = await prisma.facilityCredential.create({
    data: {
      userId,
      facilityId,
      encryptedLoginId: encryptSecret(loginId),
      encryptedPassword: encryptSecret(password),
      status: "ACTIVE",
    },
  });
  return NextResponse.json(toPublicShape(created), { status: 201 });
}
