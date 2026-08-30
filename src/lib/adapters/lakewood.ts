import * as cheerio from "cheerio";
import type { AvailableSlot, SiteAdapter, SiteSession } from "@/lib/adapters/types";
import { LoginFailedError, TransientSiteError } from "@/lib/adapters/types";

// ─────────────────────────────────────────────────────────────────────────
// 레이크우드CC(lakewood.co.kr) 사이트-어댑터
//
// 레이크우드는 신라CC(sillacc.co.kr)와 공유하는 예약 플랫폼을 쓴다. 한 골프장 안에 코스가
// 넷(물길·꽃길·산길·숲길) 있고, 시간표는 코스 구분 없이 한 번에 받는다(bookgCourse=ALL).
//
// [실사이트로 확인된 것 (2026-08-30)]
//   - 로그인: POST /member/loginChk, application/x-www-form-urlencoded 본문
//     `usrId`, `usrPwd`, `returnURL=/reservation/golf`. 응답은 JSON —
//     `{"success":"S","returnMsg":"…님 환영합니다.","returnURL":"…"}`. **성공 판정은
//     success === "S"** (실사이트 로그인 요청 캡처로 확인). 세션은 Set-Cookie(HttpOnly)로 옴.
//     coDiv 같은 추가 파라미터·안티매크로 토큰은 필요 없었다.
//   - 달력: POST /reservation/ajax/golfCalendar, 본문 `workMonth=YYYYMM` → HTML 조각.
//     각 날짜 칸은 `<td id="A{YYYYMMDD}"><a class="cal_live|cal_end|cal_closed|(빈값)"
//     onclick="clickCal(dayCls,'A','YYYYMMDD','OPEN|CLOSE|NOOPEN')">…</a></td>` 구조.
//     **예약 가능일 = `<a>`의 class가 `cal_live`(onclick 상태값 'OPEN')**. 나머지(마감
//     `cal_end`/`cal_closed`, 오픈전 빈 class/'NOOPEN')는 전부 "신청 불가"로 동일 취급.
//   - 시간표: POST /reservation/ajax/golfTimeList, 본문 `workDate=YYYYMMDD`,
//     `bookgCourse=ALL` → HTML 조각. `<table><tbody><tr>` 행이 `<td>` 5개(번호/코스/시간/
//     홀/예약)이고, **신청 가능한 행에만** `<button class="btn btn-res"
//     onclick="golfConfirm('YYYYMMDD','HHMM','courseCd','코스명','HH:MM','18홀', greenfee1,
//     greenfee2, status, '', token)"><span>신청</span></button>` 가 있다. 예약 완료분은
//     이 행 자체가 표에 없다(라비에벨과 동일 패턴). 요금은 화면에도 golfConfirm 인자에도
//     노출되지 않아('0','0') price는 항상 null이다.
//
// [아직 확인 안 된 것 / 위험]
//   - 로그인 실패(틀린 비번) 시 응답 형태 — success 값이 "S"가 아닌 무엇인지, HTTP 상태가
//     바뀌는지 미확인. 현재는 "success !== 'S' → LoginFailedError"로 처리한다.
//   - 사이트에 봇 탐지 서비스(lakewood-cdn.botnhuman.com)가 붙어 있고 예약 폼에는
//     macroChk·verify_entity_* 안티매크로 필드가 있다. 위 3개 엔드포인트(loginChk/
//     golfCalendar/golfTimeList)는 세션 쿠키만으로 raw fetch가 동작했지만, 5분마다 자동
//     로그인이 장기적으로 차단되거나 회원 계정이 잠길 가능성은 배제할 수 없다. 로그인 1회
//     실패 시 LoginFailedError → PAUSED_LOGIN_FAILED로 감시가 멈추므로(무한 재시도 없음)
//     계정 잠김 위험은 제한된다. docs/tracking/findings.md 참고.
//   - 예약 오픈 윈도우: 8월 시점에 9월(익월)만 cal_live였다. 윈도우가 어떻게 굴러가는지
//     확실치 않아 이번 달 + 향후 2개월치 달력을 훑는다.
// ─────────────────────────────────────────────────────────────────────────

const BASE_URL = "https://lakewood.co.kr";
const LOGIN_PATH = "/member/loginChk";
const CALENDAR_AJAX_PATH = "/reservation/ajax/golfCalendar";
const DAY_TIME_AJAX_PATH = "/reservation/ajax/golfTimeList";
const RESERVATION_URL = `${BASE_URL}/reservation/golf`;
const MONTHS_AHEAD = 3; // 이번 달 포함 3개월치 달력을 훑는다

const FACILITY_ID = "lakewood";

// clickCal('sat','A','20260901','OPEN') — 3번째 인자(YYYYMMDD)만 쓴다.
const CLICKCAL_DATE_RE = /clickCal\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'(\d{8})'/;
// golfConfirm('20260901','0614','1','물길','06:14','18홀',...) — 인자 순서 고정.
const GOLFCONFIRM_ARGS_RE = /golfConfirm\(([^)]*)\)/;

function yyyymmddToIso(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/** 오늘 기준 이번 달부터 count개월치 YYYYMM 목록. */
export function upcomingMonths(count: number, today = new Date()): string[] {
  const out: string[] = [];
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-based
  for (let i = 0; i < count; i += 1) {
    const d = new Date(year, month + i, 1);
    out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** 달력 조각 HTML에서 예약 가능한 날짜(YYYY-MM-DD) 목록을 뽑는다. */
export function parseCalendarDates(html: string): string[] {
  const $ = cheerio.load(html);
  const dates: string[] = [];
  $("a.cal_live").each((_, el) => {
    const onclick = $(el).attr("onclick") ?? "";
    const match = onclick.match(CLICKCAL_DATE_RE);
    if (match) dates.push(yyyymmddToIso(match[1]));
  });
  return dates;
}

function splitGolfConfirmArgs(onclick: string): string[] | null {
  const match = onclick.match(GOLFCONFIRM_ARGS_RE);
  if (!match) return null;
  return match[1].split(",").map((a) => a.trim().replace(/^'|'$/g, ""));
}

/** 시간표 조각 HTML에서 신청 가능한 슬롯 목록을 뽑는다. */
export function parseDaySlots(
  html: string,
  date: string,
  facilityId = FACILITY_ID
): AvailableSlot[] {
  const $ = cheerio.load(html);
  const slots: AvailableSlot[] = [];

  $("table tbody tr").each((_, row) => {
    // 신청 가능한 행에만 있는 버튼. 없으면(예약 완료분·헤더 등) 건너뛴다.
    const button = $(row).find("button.btn-res");
    if (button.length === 0) return;

    const args = splitGolfConfirmArgs(button.attr("onclick") ?? "");
    const cells = $(row).find("td");

    // golfConfirm 인자: [date, HHMM, courseCd, courseName, "HH:MM", holes, ...]
    const course = args?.[3]?.trim() || $(cells[1]).text().trim();
    const time = args?.[4]?.trim() || $(cells[2]).text().trim();
    if (!course || !time) return;

    slots.push({ facilityId, date, course, time, price: null });
  });

  return slots;
}

function extractCookies(response: Response): string {
  const cookies = response.headers.getSetCookie?.() ?? [];
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

async function postForm(path: string, cookie: string, body: Record<string, string>): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
      },
      body: new URLSearchParams(body).toString(),
    });
  } catch (err) {
    throw new TransientSiteError(`요청 중 네트워크 오류(${path}): ${(err as Error).message}`);
  }
  if (!response.ok) {
    throw new TransientSiteError(`요청 실패(HTTP ${response.status}): ${path}`);
  }
  return response.text();
}

export const lakewoodAdapter: SiteAdapter = {
  facilityId: FACILITY_ID,

  async login(loginId, password): Promise<SiteSession> {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${LOGIN_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest",
        },
        body: new URLSearchParams({
          usrId: loginId,
          usrPwd: password,
          returnURL: "/reservation/golf",
        }).toString(),
      });
    } catch (err) {
      throw new TransientSiteError(`로그인 요청 중 네트워크 오류: ${(err as Error).message}`);
    }

    if (response.status >= 500) {
      throw new TransientSiteError(`사이트 오류(HTTP ${response.status})`);
    }

    let payload: { success?: string; returnMsg?: string };
    try {
      payload = JSON.parse(await response.text());
    } catch {
      // 로그인 응답이 JSON이 아니면(차단 페이지 등) 자격증명 문제로 단정하지 않는다.
      throw new TransientSiteError("로그인 응답을 해석할 수 없습니다.");
    }

    // 성공 신호는 success === "S" (실사이트 캡처로 확인). 그 외는 자격증명 문제로 간주한다.
    if (payload.success !== "S") {
      throw new LoginFailedError(payload.returnMsg || undefined);
    }

    const cookie = extractCookies(response);
    if (!cookie) {
      throw new TransientSiteError("로그인은 성공했으나 세션 쿠키를 받지 못했습니다.");
    }
    return { cookie };
  },

  async scanBookableDates(session): Promise<string[]> {
    const months = upcomingMonths(MONTHS_AHEAD);
    const fragments = await Promise.all(
      months.map((workMonth) => postForm(CALENDAR_AJAX_PATH, session.cookie, { workMonth }))
    );
    const dates = fragments.flatMap((html) => parseCalendarDates(html));
    return Array.from(new Set(dates));
  },

  async scanDaySlots(session, date): Promise<AvailableSlot[]> {
    const html = await postForm(DAY_TIME_AJAX_PATH, session.cookie, {
      workDate: date.replace(/-/g, ""),
      bookgCourse: "ALL",
    });
    return parseDaySlots(html, date);
  },

  buildDeepLink(): string {
    // 날짜 선택이 폼/JS로만 이뤄져(clickCal → AJAX) 날짜별 직접 URL이 없다 —
    // 예약 캘린더 화면 URL을 반환한다.
    return RESERVATION_URL;
  },
};
