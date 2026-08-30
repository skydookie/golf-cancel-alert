import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdFromRequest } from "@/lib/auth";
import { jsonError } from "@/lib/api-helpers";
import { matchesCondition } from "@/lib/matching";
import { getAdapter } from "@/lib/adapters/registry";
import { facilityName } from "@/lib/facilities";

// 로그인한 User의 관심조건에 매칭되는, 지금 신청 가능한 시간대 목록 + 최근 알림 이력을 보여준다.
// 스케쥴 화면(/schedule)이 그리는 데이터의 출처.
export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return jsonError("로그인이 필요합니다.", 401);

  const [conditions, bookableStates, recentNotifications] = await Promise.all([
    prisma.watchCondition.findMany({ where: { userId } }),
    prisma.slotObservationState.findMany({ where: { userId, isBookable: true } }),
    prisma.notificationLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const matchedSlots = bookableStates
    .filter((s) => conditions.some((c) => matchesCondition(s, c)))
    .map((s) => ({
      facilityId: s.facilityId,
      facilityName: facilityName(s.facilityId),
      date: s.date,
      course: s.course,
      time: s.time,
      price: s.lastPrice,
      deepLinkUrl: getAdapter(s.facilityId).buildDeepLink(s.date),
    }));

  return NextResponse.json({
    matchedSlots,
    recentNotifications: recentNotifications.map((n) => ({
      id: n.id,
      facilityName: facilityName(n.facilityId),
      date: n.date,
      course: n.course,
      time: n.time,
      price: n.price,
      deepLinkUrl: n.deepLinkUrl,
      createdAt: n.createdAt,
    })),
  });
}
