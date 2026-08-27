// 사이트-어댑터 인터페이스 (spec.md "확장 구조" 참고) — 핵심 엔진(T8 감시 엔진, 매칭, 알림)은
// 이 인터페이스만 알고, 특정 골프장의 로그인/화면 구조를 몰라야 한다. 새 골프장을 추가할 때는
// 이 인터페이스의 새 구현체만 만들면 된다.

export interface AvailableSlot {
  facilityId: string;
  date: string; // YYYY-MM-DD
  course: string; // 사이트가 부르는 이름 그대로(예: "OUT" | "IN")
  time: string; // HH:mm
  price: number | null;
}

/** 아이디/비밀번호 자체가 틀렸거나 계정이 잠긴 경우 — 무한 재시도하면 안 되는 실패. */
export class LoginFailedError extends Error {
  constructor(message = "로그인에 실패했습니다(아이디/비밀번호 확인 필요).") {
    super(message);
    this.name = "LoginFailedError";
  }
}

/** 네트워크 오류, 사이트 일시 장애 등 — 자격증명 문제로 단정할 수 없는 실패. */
export class TransientSiteError extends Error {
  constructor(message = "사이트에 일시적으로 접근할 수 없습니다.") {
    super(message);
    this.name = "TransientSiteError";
  }
}

/** 어댑터가 로그인 성공 후 반환하는, 이후 요청에 필요한 세션 정보(쿠키 등). 내용은 어댑터별로 다르다. */
export interface SiteSession {
  cookie: string;
}

export interface SiteAdapter {
  facilityId: string;

  /** 아이디/비밀번호로 로그인해 세션을 얻는다. 실패 시 LoginFailedError/TransientSiteError를 던진다. */
  login(loginId: string, password: string): Promise<SiteSession>;

  /**
   * 현재 신청 가능한 시간대가 하나 이상 있는 날짜(YYYY-MM-DD) 목록을 반환한다.
   * ("마감"과 "오픈전"은 시각적으로는 구분되지만 시스템 로직상 둘 다 "신청 불가"로 동일 취급 —
   * spec.md 참고. 이 목록에는 신청 가능한 날짜만 담는다.)
   */
  scanBookableDates(session: SiteSession): Promise<string[]>;

  /** 특정 날짜의 신청 가능한 시간대 목록을 반환한다. 예약 완료된 시간대는 포함되지 않는다(확인됨). */
  scanDaySlots(session: SiteSession, date: string): Promise<AvailableSlot[]>;

  /**
   * 특정 날짜의 예약 화면으로 바로 연결되는 딥링크를 만든다. 사이트 구조상 날짜별 직접 링크가
   * 불가능하면 예약 캘린더 메인 화면 URL을 반환한다(T9 "확인 필요 사항 2" 참고).
   */
  buildDeepLink(date: string): string;
}
