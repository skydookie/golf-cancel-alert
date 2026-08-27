import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/auth";
import { jsonError, clearSessionCookie } from "@/lib/api-helpers";

// 계정 완전 탈퇴 — spec.md 하드 게이트: 암호화된 자격증명을 포함한 개인 데이터가 조회 불가능한
// 상태로 완전히 삭제되어야 한다(비활성화만으로는 불충분). Prisma 스키마의 각 관계가
// onDelete: Cascade로 선언되어 있어, User 레코드 삭제 한 번으로 FacilityCredential /
// WatchCondition / SlotObservationState / NotificationLog / PushSubscription이 DB 차원에서
// 함께 완전히 삭제된다.
export async function DELETE(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) return jsonError("로그인이 필요합니다.", 401);

  await prisma.user.delete({ where: { id: userId } });

  const response = NextResponse.json({ ok: true });
  return clearSessionCookie(response);
}
