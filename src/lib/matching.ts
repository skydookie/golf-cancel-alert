import type { AvailableSlot } from "@/lib/adapters/types";

// ── 순수 로직: 전 관측 상태 vs 새 스캔 결과를 비교해 전환을 찾는다 ──────────────
// "신청 불가 → 신청 가능"으로 전환된 시점에만 알림 대상. 이미 열려있던 건 재알림하지 않는다.
// "신청 가능 → 신청 불가 → 다시 신청 가능"으로 재전환되면 새 알림 대상.
// 식별 키 = (날짜, 코스, 시간) — 요금은 식별에 포함하지 않는다.

export interface KnownSlotState {
  date: string;
  course: string;
  time: string;
  isBookable: boolean;
}

export interface SlotTransition {
  date: string;
  course: string;
  time: string;
  price: number | null;
  kind: "BECAME_BOOKABLE" | "BECAME_UNBOOKABLE";
}

function slotKey(s: { date: string; course: string; time: string }): string {
  return `${s.date}|${s.course}|${s.time}`;
}

/**
 * previous: 이 날짜에 대해 마지막으로 관측된 상태(모두) — isBookable true/false 둘 다 포함.
 * current: 이번 스캔에서 실제로 사이트가 돌려준, "지금 신청 가능한" 슬롯 목록(그 날짜분만).
 *
 * 사이트는 신청 가능한 슬롯만 목록에 담아 돌려준다(예약 완료분은 아예 빠짐 — 확인됨).
 * 그래서 "previous에 있었는데 current에 없는 slot"은 곧 "신청 불가로 바뀜"을 뜻한다.
 */
export function diffSlots(previous: KnownSlotState[], current: AvailableSlot[]): SlotTransition[] {
  const transitions: SlotTransition[] = [];
  const previousByKey = new Map(previous.map((p) => [slotKey(p), p]));
  const currentByKey = new Map(current.map((c) => [slotKey(c), c]));

  for (const [key, slot] of currentByKey) {
    const prior = previousByKey.get(key);
    const wasBookable = prior?.isBookable ?? false;
    if (!wasBookable) {
      transitions.push({
        date: slot.date,
        course: slot.course,
        time: slot.time,
        price: slot.price,
        kind: "BECAME_BOOKABLE",
      });
    }
  }

  for (const [key, prior] of previousByKey) {
    if (prior.isBookable && !currentByKey.has(key)) {
      transitions.push({
        date: prior.date,
        course: prior.course,
        time: prior.time,
        price: null,
        kind: "BECAME_UNBOOKABLE",
      });
    }
  }

  return transitions;
}

// ── 관심조건 매칭 ──────────────────────────────────────────────────────────
export interface WatchConditionLike {
  id: string;
  dates: string[];
  timeStart: string;
  timeEnd: string;
}

/** 코스는 구분하지 않는다 — 날짜가 목록에 있고 시간이 범위 안이면 매칭. */
export function matchesCondition(
  slot: { date: string; time: string },
  condition: WatchConditionLike
): boolean {
  if (!condition.dates.includes(slot.date)) return false;
  return slot.time >= condition.timeStart && slot.time <= condition.timeEnd;
}

export function findMatchingConditions(
  slot: { date: string; time: string },
  conditions: WatchConditionLike[]
): WatchConditionLike[] {
  return conditions.filter((c) => matchesCondition(slot, c));
}
