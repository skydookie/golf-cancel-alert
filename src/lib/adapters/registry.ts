import type { SiteAdapter } from "@/lib/adapters/types";
import {
  laviebelleOldCourseAdapter,
  laviebelleDunesCourseAdapter,
} from "@/lib/adapters/laviebelle";
// lakewoodAdapter는 구현돼 있으나 아직 등록하지 않는다 — 레이크우드는 봇 탐지
// (botnhuman)가 활성이라 자동 스캔이 차단되고 회원 계정이 잠길 위험이 있다.
// 사용자가 위험을 인지하고 활성화를 결정하면 아래 맵과 facilities.ts에 추가한다.
// (docs/tracking/findings.md 참고)

// facilityId -> 어댑터. src/lib/facilities.ts의 FACILITY_IDS와 1:1로 대응해야 한다.
// 새 골프장을 추가할 때는 이 맵에 항목만 추가하면 된다 — 핵심 엔진은 이 함수를 통해서만
// 어댑터를 얻으므로 특정 골프장 구현을 직접 알지 못한다.
const ADAPTERS: Record<string, SiteAdapter> = {
  "laviebelle-old": laviebelleOldCourseAdapter,
  "laviebelle-dunes": laviebelleDunesCourseAdapter,
};

export function getAdapter(facilityId: string): SiteAdapter {
  const adapter = ADAPTERS[facilityId];
  if (!adapter) {
    throw new Error(`등록되지 않은 골프장 어댑터: ${facilityId}`);
  }
  return adapter;
}
