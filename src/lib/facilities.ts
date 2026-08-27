// 지원하는 골프장(사이트) 목록. 사이트-어댑터(src/lib/adapters)의 facilityId와 1:1로 대응한다.
// 새 골프장을 추가할 때는 여기에 항목을 추가하고 해당 어댑터를 구현하면 된다 — 핵심 엔진(관심조건,
// 알림, 화면)은 이 목록을 통해서만 골프장을 알고, 그 외에는 특정 골프장을 모른다.
export interface FacilityMeta {
  id: string;
  name: string;
}

export const FACILITIES: FacilityMeta[] = [
  { id: "laviebelle-old", name: "라비에벨 올드코스" },
  // "laviebelle-new"는 T3에서 실사이트 조사 결과에 따라 추가된다(구조가 다르면 별도 어댑터로).
];

export const FACILITY_IDS = FACILITIES.map((f) => f.id);

export function isKnownFacilityId(id: string): boolean {
  return FACILITY_IDS.includes(id);
}

export function facilityName(id: string): string {
  return FACILITIES.find((f) => f.id === id)?.name ?? id;
}
