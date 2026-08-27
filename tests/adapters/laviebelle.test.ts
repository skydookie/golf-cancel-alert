import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCalendarHtml, parseDaySlotsHtml } from "@/lib/adapters/laviebelle";

// ⚠️ 아래 fixture는 실제 사이트 HTML이 아니라 스크린샷 기반 추정 구조다 — 파일 상단 주석과
// src/lib/adapters/laviebelle.ts 상단 주석 참고. 실사이트 구조가 확인되면 fixture와 파서
// 선택자를 함께 갱신해야 한다.

function fixture(name: string): string {
  return readFileSync(join(__dirname, "..", "fixtures", name), "utf-8");
}

describe("parseCalendarHtml", () => {
  it("신청 가능한(bookable) 날짜만 뽑아낸다 — 마감/오픈전/오늘 표시는 제외", () => {
    const dates = parseCalendarHtml(fixture("laviebelle-calendar.html"));
    expect(dates).toEqual([
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-04",
      "2026-09-05",
    ]);
  });
});

describe("parseDaySlotsHtml", () => {
  it("신청 버튼이 있는 행만 슬롯으로 파싱한다", () => {
    const slots = parseDaySlotsHtml(fixture("laviebelle-day.html"), "2026-08-29");
    expect(slots).toEqual([
      { facilityId: "laviebelle-old", date: "2026-08-29", course: "OUT", time: "07:26", price: 250000 },
      { facilityId: "laviebelle-old", date: "2026-08-29", course: "OUT", time: "12:46", price: 250000 },
      { facilityId: "laviebelle-old", date: "2026-08-29", course: "IN", time: "13:42", price: 250000 },
    ]);
  });

  it("신청 버튼이 없는 행(예약 완료분)은 애초에 표에 없다는 전제를 반영해, 빈 표는 빈 배열을 준다", () => {
    const emptyHtml = `<table class="gres-time-table"><tbody></tbody></table>`;
    expect(parseDaySlotsHtml(emptyHtml, "2026-08-30")).toEqual([]);
  });
});
