import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseCalendarHtml,
  parseCalendarDays,
  parseDaySlotsHtml,
  extractShellContext,
  yyyymmOf,
  nextYyyymm,
} from "@/lib/adapters/laviebelle";

// laviebelle-calendar.html / laviebelle-day.html / laviebelle-reservation-shell.html은 모두
// 실제 사이트에서 캡처한 HTML이다 — 각 파일 상단 주석 참고.

function fixture(name: string): string {
  return readFileSync(join(__dirname, "..", "fixtures", name), "utf-8");
}

describe("parseCalendarHtml (실제 캡처본 fixture 사용)", () => {
  it("바깥 div 클래스가 cm_liv인 날짜만 뽑아낸다 — 마감(cm_end)/오늘(cm_tod)은 제외", () => {
    const dates = parseCalendarHtml(fixture("laviebelle-calendar.html"));
    expect(dates).toEqual(["2026-08-29", "2026-08-30", "2026-08-31"]);
  });
});

describe("parseCalendarDays (실제 캡처본 fixture 사용)", () => {
  it("마감인 날짜도 openyn/dategbn과 함께 bookable:false로 담아온다", () => {
    const days = parseCalendarDays(fixture("laviebelle-calendar.html"));
    const aug1 = days.find((d) => d.date === "2026-08-01");
    expect(aug1).toEqual({ date: "2026-08-01", bookable: false, openyn: "2", dategbn: "7" });
  });

  it("예약 가능한 날짜는 bookable:true와 실제 openyn/dategbn을 담아온다", () => {
    const days = parseCalendarDays(fixture("laviebelle-calendar.html"));
    const aug29 = days.find((d) => d.date === "2026-08-29");
    expect(aug29).toEqual({ date: "2026-08-29", bookable: true, openyn: "2", dategbn: "7" });
  });

  it("날짜가 없는 빈 칸(익월 넘어간 칸 등)은 결과에 포함되지 않는다", () => {
    const days = parseCalendarDays(fixture("laviebelle-calendar.html"));
    expect(days).toHaveLength(31); // 8월은 31일
  });
});

describe("parseDaySlotsHtml (실제 캡처본 fixture 사용)", () => {
  it("신청 링크(id=timeresbtn_*)가 있는 행만 슬롯으로 파싱하고, 요금은 셀 텍스트가 아니라 신청 링크의 할인가 인자에서 뽑는다", () => {
    const slots = parseDaySlotsHtml(fixture("laviebelle-day.html"), "2026-08-29");
    expect(slots).toEqual([
      { facilityId: "laviebelle-old", date: "2026-08-29", course: "OUT", time: "11:43", price: 230000 },
      { facilityId: "laviebelle-old", date: "2026-08-29", course: "IN", time: "13:42", price: 230000 },
    ]);
  });

  it("헤더 행(<th>만 있음)은 자연히 걸러진다", () => {
    const headerOnlyHtml = `<table><tbody><tr><th>번호</th><th>코스</th><th>시간</th><th>일반요금</th><th>예약</th></tr></tbody></table>`;
    expect(parseDaySlotsHtml(headerOnlyHtml, "2026-08-30")).toEqual([]);
  });

  it("신청 버튼이 없는 행(예약 완료분)은 애초에 표에 없다는 전제를 반영해, 빈 표는 빈 배열을 준다", () => {
    const emptyHtml = `<table><tbody></tbody></table>`;
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
