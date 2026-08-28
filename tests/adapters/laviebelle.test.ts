import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseCalendarHtml,
  parseDaySlotsHtml,
  extractShellContext,
  yyyymmOf,
  nextYyyymm,
} from "@/lib/adapters/laviebelle";

// ⚠️ laviebelle-calendar.html / laviebelle-day.html은 실제 사이트 HTML이 아니라 스크린샷 기반
// 추정 구조다 — 파일 상단 주석과 src/lib/adapters/laviebelle.ts 상단 주석 참고. AJAX 응답
// 조각의 실제 구조가 확인되면 fixture와 파서 선택자를 함께 갱신해야 한다.
// laviebelle-reservation-shell.html은 반대로 실제 캡처본이다 — extractShellContext 테스트 참고.

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

describe("extractShellContext (실제 캡처본 fixture 사용)", () => {
  it("예약 캘린더 셸 페이지의 숨은 폼에서 usrmemcd/toDay를 읽어온다", () => {
    const ctx = extractShellContext(fixture("laviebelle-reservation-shell.html"));
    expect(ctx).toEqual({ usrmemcd: "10", toDay: "20260828" });
  });

  it("필수 숨은 필드가 없으면 TransientSiteError를 던진다", () => {
    expect(() => extractShellContext("<html><body>빈 페이지</body></html>")).toThrow();
  });
});

describe("yyyymmOf / nextYyyymm", () => {
  it("YYYYMMDD에서 YYYYMM을 뽑는다", () => {
    expect(yyyymmOf("20260828")).toBe("202608");
  });

  it("다음 달을 계산한다", () => {
    expect(nextYyyymm("20260828")).toBe("202609");
  });

  it("12월이면 다음 해 1월로 넘어간다", () => {
    expect(nextYyyymm("20261231")).toBe("202701");
  });
});
