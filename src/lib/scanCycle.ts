import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { getAdapter } from "@/lib/adapters/registry";
import { LoginFailedError, TransientSiteError } from "@/lib/adapters/types";
import {
  diffSlots,
  findMatchingConditions,
  type KnownSlotState,
  type WatchConditionLike,
} from "@/lib/matching";
import { sendSlotPushToUser, sendLoginFailureNotice } from "@/lib/push";
import { facilityName } from "@/lib/facilities";

export interface ScanCycleSummary {
  credentialsScanned: number;
  credentialsSkippedNoConditions: number;
  loginFailures: number;
  transientFailures: number;
  unexpectedFailures: number;
  notificationsSent: number;
}

/**
 * 감시·매칭·알림 엔진의 한 사이클:
 *   - 활성 관심조건 + 정상 상태(ACTIVE) 자격증명을 가진 모든 (User, Facility)를 대상으로 스캔
 *   - "신청 불가 → 신청 가능" 전환만 알림, 재전환은 새 알림, 유지 중엔 재알림 없음
 *   - 동시 다발 전환은 각각 개별 알림
 *   - 로그인 실패 시 즉시 알림 + 해당 계정 감시 일시중지(무한 재시도 금지)
 *   - 회원 등급별로 보이는 목록이 다를 수 있으므로 User마다 개별적으로 로그인·스캔한다
 *     (대표 계정으로 공용 감시하지 않는다)
 *   - 한 (User, Facility)의 실패가 다른 (User, Facility)의 스캔을 막지 않는다(격리 처리)
 */
export async function runScanCycle(): Promise<ScanCycleSummary> {
  const summary: ScanCycleSummary = {
    credentialsScanned: 0,
    credentialsSkippedNoConditions: 0,
    loginFailures: 0,
    transientFailures: 0,
    unexpectedFailures: 0,
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

    // 한 (User, Facility)의 실패(로그인 실패든, 스캔 도중의 네트워크 오류든, 예상 못한 예외든)가
    // 다른 (User, Facility)의 스캔을 막으면 안 된다 — 그래서 로그인부터 알림 발송까지 전체를 이
    // credential 단위로 격리한다.
    try {
      await processCredential(credential, conditions, summary);
    } catch (err) {
      summary.unexpectedFailures += 1;
      console.error(
        `[scanCycle] (${credential.userId}, ${credential.facilityId}) 처리 중 예상 못한 오류 — 이 계정만 건너뛰고 계속 진행합니다.`,
        err
      );
    }
  }

  return summary;
}

async function processCredential(
  credential: { id: string; userId: string; facilityId: string; encryptedLoginId: string; encryptedPassword: string },
  conditions: WatchConditionLike[],
  summary: ScanCycleSummary
): Promise<void> {
  const adapter = getAdapter(credential.facilityId);

  // 로그인부터 마지막 알림 발송까지 전부 하나의 try/catch로 묶는다 — LoginFailedError/
  // TransientSiteError는 로그인 단계뿐 아니라(어댑터 계약상 이론적으로) 스캔 단계에서도 던져질
  // 수 있으므로, 어느 단계에서 나든 같은 기준으로 분류해야 한다. 그 외 예상 못한 예외는 상위
  // (runScanCycle)의 credential 단위 try/catch가 격리한다.
  try {
    // loginless 어댑터(예: 레이크우드 — 봇 차단 때문에 비로그인 감시)는 login()을 호출하지
    // 않고 세션 없이 스캔한다. 자격증명(빈 값으로 저장돼 있음)도 복호화하지 않는다.
    const session = adapter.loginless
      ? { cookie: "" }
      : await adapter.login(
          decryptSecret(credential.encryptedLoginId),
          decryptSecret(credential.encryptedPassword)
        );

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
      throw err; // 상위(runScanCycle)의 credential 단위 try/catch가 격리한다.
    }
  }
}
