import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return jsonError("로그인이 필요합니다.", 401);

  const condition = await prisma.watchCondition.findUnique({ where: { id: params.id } });
  // 존재하지 않거나 다른 User 소유면 동일하게 404로 응답 — 다른 사람 조건의 존재 여부 자체를 노출하지 않음.
  if (!condition || condition.userId !== userId) {
    return jsonError("관심조건을 찾을 수 없습니다.", 404);
  }

  await prisma.watchCondition.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
