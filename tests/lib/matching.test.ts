import { describe, expect, it } from "vitest";
import { diffSlots, matchesCondition, findMatchingConditions } from "@/lib/matching";
import type { AvailableSlot } from "@/lib/adapters/types";

const slot = (over: Partial<AvailableSlot> = {}): AvailableSlot => ({
  facilityId: "laviebelle-old",
  date: "2026-09-06",
  course: "OUT",
  time: "07:26",
  price: 250000,
  ...over,
});

describe("diffSlots — 전환 감지", () => {
  it("전혀 관측된 적 없는 슬롯이 나타나면 BECAME_BOOKABLE", () => {
    const transitions = diffSlots([], [slot()]);
    expect(transitions).toEqual([
      { date: "2026-09-06", course: "OUT", time: "07:26", price: 250000, kind: "BECAME_BOOKABLE" },
    ]);
  });

  it("이미 신청 가능 상태로 계속 열려있으면 재알림하지 않는다", () => {
    const previous = [{ date: "2026-09-06", course: "OUT", time: "07:26", isBookable: true }];
    const transitions = diffSlots(previous, [slot()]);
    expect(transitions).toEqual([]);
  });

  it("신청 불가였다가 신청 가능으로 바뀌면 BECAME_BOOKABLE", () => {
    const previous = [{ date: "2026-09-06", course: "OUT", time: "07:26", isBookable: false }];
    const transitions = diffSlots(previous, [slot()]);
    expect(transitions).toHaveLength(1);
    expect(transitions[0].kind).toBe("BECAME_BOOKABLE");
  });

  it("신청 가능이었는데 목록에서 사라지면 BECAME_UNBOOKABLE", () => {
    const previous = [{ date: "2026-09-06", course: "OUT", time: "07:26", isBookable: true }];
    const transitions = diffSlots(previous, []);
    expect(transitions).toEqual([
      { date: "2026-09-06", course: "OUT", time: "07:26", price: null, kind: "BECAME_UNBOOKABLE" },
    ]);
  });

  it("재전환(닫혔다 다시 열림)은 새 BECAME_BOOKABLE 이벤트다", () => {
    // 1차: 처음 열림
    let state = [{ date: "2026-09-06", course: "OUT", time: "07:26", isBookable: false }];
    let transitions = diffSlots(state, [slot()]);
    expect(transitions[0].kind).toBe("BECAME_BOOKABLE");

    // 상태 갱신: 이제 isBookable = true
    state = [{ date: "2026-09-06", course: "OUT", time: "07:26", isBookable: true }];
    // 2차: 누가 잡아서 사라짐
    transitions = diffSlots(state, []);
    expect(transitions[0].kind).toBe("BECAME_UNBOOKABLE");

    // 상태 갱신: 이제 isBookable = false
    state = [{ date: "2026-09-06", course: "OUT", time: "07:26", isBookable: false }];
    // 3차: 다시 열림 — 새 알림 대상이어야 함
    transitions = diffSlots(state, [slot()]);
    expect(transitions).toHaveLength(1);
    expect(transitions[0].kind).toBe("BECAME_BOOKABLE");
  });

  it("동시에 여러 슬롯이 새로 열리면 각각 개별 항목으로 반환한다(묶지 않음)", () => {
    const transitions = diffSlots(
      [],
      [slot({ time: "07:26" }), slot({ course: "IN", time: "12:46" })]
    );
    expect(transitions).toHaveLength(2);
  });

  it("코스가 다르면 다른 슬롯으로 취급한다(같은 시간이라도)", () => {
    const previous = [{ date: "2026-09-06", course: "OUT", time: "12:46", isBookable: true }];
    const transitions = diffSlots(previous, [slot({ course: "IN", time: "12:46" })]);
    // OUT 12:46은 사라졌으니 UNBOOKABLE, IN 12:46은 새로 생겼으니 BOOKABLE
    expect(transitions).toHaveLength(2);
    expect(transitions.map((t) => t.kind).sort()).toEqual(["BECAME_BOOKABLE", "BECAME_UNBOOKABLE"]);
  });

  it("가격이 바뀌어도 같은 자리로 취급한다(재알림 없음)", () => {
    const previous = [{ date: "2026-09-06", course: "OUT", time: "07:26", isBookable: true }];
    const transitions = diffSlots(previous, [slot({ price: 300000 })]);
    expect(transitions).toEqual([]);
  });
});

describe("관심조건 매칭 — 코스 무관, 날짜+시간대만", () => {
  const condition = { id: "c1", dates: ["2026-09-06", "2026-09-13"], timeStart: "06:00", timeEnd: "09:00" };

  it("날짜가 목록에 있고 시간이 범위 안이면 매칭(경계값 포함)", () => {
    expect(matchesCondition({ date: "2026-09-06", time: "06:00" }, condition)).toBe(true);
    expect(matchesCondition({ date: "2026-09-06", time: "09:00" }, condition)).toBe(true);
    expect(matchesCondition({ date: "2026-09-06", time: "07:26" }, condition)).toBe(true);
  });

  it("날짜가 목록에 없으면 매칭되지 않는다", () => {
    expect(matchesCondition({ date: "2026-09-07", time: "07:26" }, condition)).toBe(false);
  });

  it("시간이 범위 밖이면 매칭되지 않는다", () => {
    expect(matchesCondition({ date: "2026-09-06", time: "05:59" }, condition)).toBe(false);
    expect(matchesCondition({ date: "2026-09-06", time: "09:01" }, condition)).toBe(false);
  });

  it("코스는 매칭 조건에 영향을 주지 않는다", () => {
    // matchesCondition 자체가 course를 받지 않음 — 타입 수준에서 이미 무관함을 보장.
    // 여러 코스의 슬롯이 같은 조건에 동일하게 매칭되는지 findMatchingConditions로 확인.
    const matches = findMatchingConditions({ date: "2026-09-06", time: "07:26" }, [condition]);
    expect(matches).toHaveLength(1);
  });

  it("여러 조건이 동시에 매칭될 수 있다", () => {
    const c2 = { id: "c2", dates: ["2026-09-06"], timeStart: "00:00", timeEnd: "23:59" };
    const matches = findMatchingConditions({ date: "2026-09-06", time: "07:26" }, [condition, c2]);
    expect(matches.map((m) => m.id).sort()).toEqual(["c1", "c2"]);
  });
});
