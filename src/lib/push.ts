import webpush from "web-push";
import { prisma } from "@/lib/db";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT 환경변수가 필요합니다.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
}

/**
 * 알림 대상 User의 모든 등록된 기기(구독)에 웹푸시를 발송하는 저수준 공용 함수.
 * 더 이상 유효하지 않은 구독(브라우저가 만료시킨 endpoint, 410/404 응답)은 자동으로 정리한다.
 */
export async function sendPushToUser(userId: string, message: PushMessage): Promise<void> {
  ensureConfigured();

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  const body = JSON.stringify(message);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // 브라우저/기기에서 만료되거나 취소된 구독 — 조용히 정리한다.
          await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => {});
        } else {
          throw err;
        }
      }
    })
  );
}

export interface SlotPushPayload {
  facilityName: string;
  date: string;
  course: string;
  time: string;
  price: number | null;
  deepLinkUrl: string;
}

/**
 * 동시에 여러 슬롯이 새로 열려도 묶지 않고 각각 개별 발송한다 — 이 함수를 슬롯 하나당 한 번씩
 * 호출하는 것이 호출부(scanCycle.ts의 감시 엔진)의 책임이다.
 */
export async function sendSlotPushToUser(userId: string, payload: SlotPushPayload): Promise<void> {
  await sendPushToUser(userId, {
    title: "취소표 발생",
    body: `${payload.facilityName} ${payload.date} ${payload.course} ${payload.time}${
      payload.price != null ? ` · ${payload.price.toLocaleString()}원` : ""
    }`,
    url: payload.deepLinkUrl,
  });
}

/** 골프장 계정 로그인 실패 시 즉시 사용자에게 알린다 — 그 계정에 대한 무한 재시도는 하지 않는다. */
export async function sendLoginFailureNotice(userId: string, facilityName: string): Promise<void> {
  await sendPushToUser(userId, {
    title: "골프장 계정 로그인 실패",
    body: `${facilityName} 계정으로 자동 로그인에 실패해 감시를 일시중지했어요. 설정에서 계정 정보를 확인해주세요.`,
    url: "/settings",
  });
}
