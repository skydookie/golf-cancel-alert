"use client";

import { useEffect, useState } from "react";
import { AppNav } from "@/components/app/nav";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { enablePushNotifications } from "@/lib/pushClient";
import { BellRinging, ArrowSquareOut, GolfIcon } from "@phosphor-icons/react/dist/ssr";

interface MatchedSlot {
  facilityId: string;
  facilityName: string;
  date: string;
  course: string;
  time: string;
  price: number | null;
  deepLinkUrl: string;
}

interface NotificationItem extends MatchedSlot {
  id: string;
  createdAt: string;
}

interface ScheduleData {
  matchedSlots: MatchedSlot[];
  recentNotifications: NotificationItem[];
}

export default function SchedulePage() {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushMessage, setPushMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/schedule")
      .then((res) => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  async function handleEnablePush() {
    const result = await enablePushNotifications();
    setPushMessage(
      result.ok
        ? { ok: true, text: "이 기기로 취소표 알림을 받을 수 있어요." }
        : { ok: false, text: result.reason ?? "알림을 켜지 못했어요." }
    );
  }

  return (
    <div className="min-h-[100dvh]">
      <AppNav />
      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-text-primary">지금 신청 가능한 취소표</h1>
            <p className="mt-1 text-sm text-text-secondary">관심조건에 맞는 시간대만 보여드려요.</p>
          </div>
          <Button variant="secondary" onClick={handleEnablePush} className="shrink-0">
            <BellRinging size={16} />
            알림 켜기
          </Button>
        </div>

        {pushMessage ? <Alert tone={pushMessage.ok ? "success" : "error"}>{pushMessage.text}</Alert> : null}

        {loading ? (
          <SkeletonList />
        ) : data && data.matchedSlots.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
            {data.matchedSlots.map((slot, i) => (
              <SlotRow key={`${slot.facilityId}-${slot.date}-${slot.course}-${slot.time}-${i}`} slot={slot} />
            ))}
          </ul>
        ) : (
          <EmptyState />
        )}

        {data && data.recentNotifications.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-text-secondary">최근 알림 이력</h2>
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
              {data.recentNotifications.map((n) => (
                <SlotRow key={n.id} slot={n} timestamp={n.createdAt} />
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function SlotRow({ slot, timestamp }: { slot: MatchedSlot; timestamp?: string }) {
  return (
    <li>
      <a
        href={slot.deepLinkUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-between gap-4 px-4 py-3.5 transition hover:bg-surface-elevated"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            <GolfIcon size={18} weight="fill" />
          </span>
          <div>
            <p className="text-sm font-medium text-text-primary">
              {slot.date} · {slot.course} {slot.time}
            </p>
            <p className="text-xs text-text-secondary">
              {slot.facilityName}
              {slot.price != null ? ` · ${slot.price.toLocaleString()}원` : ""}
              {timestamp ? ` · ${new Date(timestamp).toLocaleString("ko-KR")}` : ""}
            </p>
          </div>
        </div>
        <ArrowSquareOut size={18} className="shrink-0 text-text-secondary" />
      </a>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <GolfIcon size={28} className="text-text-secondary" />
      <p className="text-sm font-medium text-text-primary">아직 신청 가능한 취소표가 없어요</p>
      <p className="text-sm text-text-secondary">관심조건에 맞는 시간대가 열리면 여기에 나타나고, 알림도 갈 거예요.</p>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="h-9 w-9 animate-pulse rounded-full bg-surface-elevated" />
          <div className="flex flex-col gap-2">
            <div className="h-3.5 w-40 animate-pulse rounded bg-surface-elevated" />
            <div className="h-3 w-28 animate-pulse rounded bg-surface-elevated" />
          </div>
        </div>
      ))}
    </div>
  );
}
