import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { getAdapter } from "@/lib/adapters/registry";
import { LoginFailedError, TransientSiteError } from "@/lib/adapters/types";
import { diffSlots, findMatchingConditions, type KnownSlotState } from "@/lib/matching";
import { sendSlotPushToUser, sendLoginFailureNotice } from "@/lib/push";
import { facilityName } from "@/lib/facilities";

export interface ScanCycleSummary {
  credentialsScanned: number;
  credentialsSkippedNoConditions: number;
  loginFailures: number;
  transientFailures: number;
  notificationsSent: number;
}

/**
 * 감시·매칭·알림 엔진의 한 사이클 — spec.md "필수 검증" 항목들을 그대로 구현한다:
 *   - 활성 관심조건 + 정상 상태(ACTIVE) 자격증명을 가진 모든 (User, Facility)를 대상으로 스캔
 *   - "신청 불가 → 신청 가능" 전환만 알림, 재전환은 새 알림, 유지 중엔 재알림 없음
 *   - 동시 다발 전환은 각각 개별 알림
 *   - 로그인 실패 시 즉시 알림 + 해당 계정 감시 일시중지(무한 재시도 금지)
 *   - 회원 등급별로 보이는 목록이 다를 수 있으므로 User마다 개별적으로 로그인·스캔한다
 *     (대표 계정으로 공용 감시하지 않는다 — handoff.md 하드 게이트)
 */
export async function runScanCycle(): Promise<ScanCycleSummary> {
  const summary: ScanCycleSummary = {
    credentialsScanned: 0,
    credentialsSkippedNoConditions: 0,
    loginFailures: 0,
    transientFailures: 0,
    notificationsSent: 0,
  };

  const activeCredentials = await prisma.facilityCredential.findMany({
    where: { status: "ACTIVE" },
  });

  for (const credential of activeCredentials) {
    const conditions = await prisma.watchCondition.findMany({
      where: { userId: credential.userId },
    });
    if (conditions.length === 0) {
      summary.credentialsSkippedNoConditions += 1;
      continue;
    }

    summary.credentialsScanned += 1;
    const adapter = getAdapter(credential.facilityId);

    let session;
    try {
      session = await adapter.login(
        decryptSecret(credential.encryptedLoginId),
        decryptSecret(credential.encryptedPassword)
      );
    } catch (err) {
      if (err instanceof LoginFailedError) {
        summary.loginFailures += 1;
        await prisma.facilityCredential.update({
          where: { id: credential.id },
          data: { status: "PAUSED_LOGIN_FAILED", lastError: err.message },
        });
        await sendLoginFailureNotice(credential.userId, facilityName(credential.facilityId));
      } else if (err instanceof TransientSiteError) {
        // 일시적 오류 — 계정을 잠그지 않고 다음 사이클에 다시 시도한다.
        summary.transientFailures += 1;
      } else {
        throw err;
      }
      continue;
    }

    // 이번에 신청 가능한 날짜 + 예전에 신청 가능하다고 기록해뒀던 날짜(완전히 마감돼 사라졌을
    // 수도 있으니 반드시 함께 확인) 를 합쳐서 스캔 대상 날짜로 삼는다.
    const bookableDates = await adapter.scanBookableDates(session);
    const previouslyBookableDates = await prisma.slotObservationState.findMany({
      where: { userId: credential.userId, facilityId: credential.facilityId, isBookable: true },
      select: { date: true },
      distinct: ["date"],
    });
    const datesToCheck = Array.from(
      new Set([...bookableDates, ...previouslyBookableDates.map((d) => d.date)])
    );

    for (const date of datesToCheck) {
      const currentSlots = await adapter.scanDaySlots(session, date);
      const previousStates = await prisma.slotObservationState.findMany({
        where: { userId: credential.userId, facilityId: credential.facilityId, date },
      });
      const knownStates: KnownSlotState[] = previousStates.map((s) => ({
        date: s.date,
        course: s.course,
        time: s.time,
        isBookable: s.isBookable,
      }));

      const transitions = diffSlots(knownStates, currentSlots);

      for (const transition of transitions) {
        await prisma.slotObservationState.upsert({
          where: {
            userId_facilityId_date_course_time: {
              userId: credential.userId,
              facilityId: credential.facilityId,
              date: transition.date,
              course: transition.course,
              time: transition.time,
            },
          },
          create: {
            userId: credential.userId,
            facilityId: credential.facilityId,
            date: transition.date,
            course: transition.course,
            time: transition.time,
            isBookable: transition.kind === "BECAME_BOOKABLE",
            lastPrice: transition.price,
          },
          update: {
            isBookable: transition.kind === "BECAME_BOOKABLE",
            lastPrice: transition.price,
          },
        });

        if (transition.kind !== "BECAME_BOOKABLE") continue;

        const matches = findMatchingConditions(transition, conditions);
        if (matches.length === 0) continue;

        const deepLinkUrl = adapter.buildDeepLink(transition.date);
        await prisma.notificationLog.create({
          data: {
            userId: credential.userId,
            facilityId: credential.facilityId,
            date: transition.date,
            course: transition.course,
            time: transition.time,
            price: transition.price,
            deepLinkUrl,
          },
        });
        await sendSlotPushToUser(credential.userId, {
          facilityName: facilityName(credential.facilityId),
          date: transition.date,
          course: transition.course,
          time: transition.time,
          price: transition.price,
          deepLinkUrl,
        });
        summary.notificationsSent += 1;
      }
    }
  }

  return summary;
}
