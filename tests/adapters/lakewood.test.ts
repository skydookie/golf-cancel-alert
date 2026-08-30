import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseCalendarDates,
  parseDaySlots,
  upcomingMonths,
  lakewoodAdapter,
} from "@/lib/adapters/lakewood";
import { getAdapter } from "@/lib/adapters/registry";
import { isLoginlessFacility, FACILITY_IDS } from "@/lib/facilities";

// lakewood-calendar.html / lakewood-timelist.html은 2026-08-30 실사이트에서 관측한 구조를
// 반영해 재구성한 fixture다(전체 raw 응답은 botnhuman 봇 차단에 막혀 확보 못 함 — 각 파일
// 상단 주석과 docs/tracking/findings.md 참고). 사이트 구조가 확인되면 fixture를 갱신한다.

function fixture(name: string): string {
  return readFileSync(join(__dirname, "..", "fixtures", name), "utf-8");
}

describe("parseCalendarDates", () => {
  it("class가 cal_live인 날짜만 뽑는다 — 마감(cal_end/cal_closed)/오픈전은 제외", () => {
    const dates = parseCalendarDates(fixture("lakewood-calendar.html"));
    expect(dates).toEqual(["2026-09-01", "2026-09-02", "2026-09-05"]);
  });

  it("cal_live가 하나도 없으면 빈 배열", () => {
    expect(parseCalendarDates('<table><tr><td><a class="cal_end" onclick="clickCal(\'\',\'A\',\'20260903\',\'CLOSE\')">3</a></td></tr></table>')).toEqual([]);
  });
});

describe("parseDaySlots", () => {
  it("신청 버튼(button.btn-res)이 있는 행만 슬롯으로 파싱하고, 코스·시간은 golfConfirm 인자에서 뽑는다", () => {
    const slots = parseDaySlots(fixture("lakewood-timelist.html"), "2026-09-01");
    expect(slots).toEqual([
      { facilityId: "lakewood", date: "2026-09-01", course: "물길", time: "06:14", price: null },
      { facilityId: "lakewood", date: "2026-09-01", course: "산길", time: "06:14", price: null },
      { facilityId: "lakewood", date: "2026-09-01", course: "꽃길", time: "13:42", price: null },
    ]);
  });

  it("헤더만 있거나 빈 표는 빈 배열을 준다(예약 완료분은 애초에 표에 없음)", () => {
    expect(parseDaySlots("<table><thead><tr><th>번호</th></tr></thead><tbody></tbody></table>", "2026-09-01")).toEqual([]);
  });

  it("facilityId 인자를 넘기면 슬롯에 반영된다", () => {
    const slots = parseDaySlots(fixture("lakewood-timelist.html"), "2026-09-01", "lakewood-x");
    expect(slots.every((s) => s.facilityId === "lakewood-x")).toBe(true);
  });
});

describe("loginless 등록", () => {
  it("어댑터는 loginless이고 registry/facilities와 일관된다", () => {
    expect(lakewoodAdapter.loginless).toBe(true);
    expect(getAdapter("lakewood")).toBe(lakewoodAdapter);
    expect(FACILITY_IDS).toContain("lakewood");
    expect(isLoginlessFacility("lakewood")).toBe(true);
    expect(isLoginlessFacility("laviebelle-old")).toBe(false);
  });

  it("login()은 호출되면 안 되며, 호출 시 TransientSiteError를 던진다", async () => {
    await expect(lakewoodAdapter.login("x", "y")).rejects.toThrow();
  });

  it("buildDeepLink는 예약 화면 URL을 반환한다", () => {
    expect(lakewoodAdapter.buildDeepLink("2026-09-01")).toBe(
      "https://lakewood.co.kr/reservation/golf"
    );
  });
});

describe("upcomingMonths", () => {
  it("오늘 포함 count개월치 YYYYMM을 반환한다", () => {
    expect(upcomingMonths(3, new Date(2026, 10, 15))).toEqual(["202611", "202612", "202701"]);
  });

  it("연말을 넘어가면 다음 해로 넘어간다", () => {
    expect(upcomingMonths(2, new Date(2026, 11, 1))).toEqual(["202612", "202701"]);
  });
});
