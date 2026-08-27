// 브라우저에서 실행되는 웹푸시 구독 등록 로직. service worker(/sw.js) 등록 → 푸시 구독 생성 →
// 서버에 저장(/api/push/subscribe)까지 한 번에 처리한다.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function enablePushNotifications(): Promise<{ ok: boolean; reason?: string }> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "이 브라우저는 웹 푸시 알림을 지원하지 않아요." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "알림 권한이 허용되지 않았어요." };
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    return { ok: false, reason: "알림 설정이 아직 준비되지 않았어요." };
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });

  const json = subscription.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });

  return res.ok ? { ok: true } : { ok: false, reason: "서버에 구독 정보를 저장하지 못했어요." };
}
