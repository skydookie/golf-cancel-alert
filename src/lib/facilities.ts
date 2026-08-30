// 지원하는 골프장(사이트) 목록. 사이트-어댑터(src/lib/adapters)의 facilityId와 1:1로 대응한다.
// 새 골프장을 추가할 때는 여기에 항목을 추가하고 해당 어댑터를 구현하면 된다 — 핵심 엔진(관심조건,
// 알림, 화면)은 이 목록을 통해서만 골프장을 알고, 그 외에는 특정 골프장을 모른다.
export interface FacilityMeta {
  id: string;
  name: string;
  /**
   * true면 로그인 없이(비회원 화면으로) 감시한다 — 골프장 계정 등록이 필요 없다.
   * src/lib/adapters의 해당 어댑터 `loginless` 값과 반드시 일치해야 한다. 이 파일은
   * 클라이언트에서도 import되므로(설정 화면) 어댑터를 직접 참조하지 않고 여기에 표시한다.
   */
  loginless?: boolean;
}

export const FACILITIES: FacilityMeta[] = [
  { id: "laviebelle-old", name: "라비에벨 올드코스" },
  // 듄스코스는 올드코스와 경로 접두사(/dunescourse)만 다르고 로그인·달력·시간표 구조가 완전히
  // 동일하다(2026-08-30 실사이트 확인) — 같은 어댑터 구현을 코스 설정만 바꿔 재사용한다.
  { id: "laviebelle-dunes", name: "라비에벨 듄스코스" },
  // 레이크우드CC — 봇 탐지(botnhuman)가 활성이라 자동 로그인이 위험하다. 다행히 비로그인
  // 상태로도 달력/시간표가 보여 loginless로 감시한다(계정 등록 불필요, 회원 등급 전용
  // 시간표는 못 볼 수 있음). docs/tracking/findings.md 참고.
  { id: "lakewood", name: "레이크우드CC", loginless: true },
];

export const FACILITY_IDS = FACILITIES.map((f) => f.id);

export function isKnownFacilityId(id: string): boolean {
  return FACILITY_IDS.includes(id);
}

export function isLoginlessFacility(id: string): boolean {
  return FACILITIES.find((f) => f.id === id)?.loginless === true;
}

export function facilityName(id: string): string {
  return FACILITIES.find((f) => f.id === id)?.name ?? id;
}
