// 초대코드 검증. 가장 단순한 형태(운영자가 관리하는 공용 코드 1개, 환경변수)로 구현한다.
// 나중에 여러 개의 1회용 코드가 필요해지면 이 함수 내부만 바꾸면 되고, 호출부(회원가입 API)는
// 변경할 필요 없다.
export function isValidInviteCode(code: string | undefined | null): boolean {
  const expected = process.env.INVITE_CODE;
  if (!expected) {
    throw new Error("INVITE_CODE 환경변수가 설정되지 않았습니다.");
  }
  if (!code) return false;
  return code === expected;
}
