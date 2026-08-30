import bcrypt from "bcryptjs";
import crypto from "node:crypto";

// ── App User 로그인 비밀번호: 단방향 해시 (복원 불가) ──────────────────────────
// 앱 자체 로그인 비밀번호는 절대 복원되어서는 안 된다. bcrypt는 검증만 가능하고
// 원문을 되돌리는 절차 자체가 존재하지 않는다 — 아래 가역 암호화 함수와 혼용 금지.

// bcryptjs(순수 JS)는 네이티브 bcrypt보다 3~5배 느리다. Vercel Hobby의 제한된 서버리스
// CPU에서 rounds=12는 로그인 1회에 2~4초가 걸린다. 초대제 개인 앱(사용자 소수, 세션 30일)
// 에는 rounds=10이면 충분하다. 기존 rounds=12 해시는 그대로 검증된다(해시에 코스트가 포함됨).
const BCRYPT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ── Facility Credential(골프장 계정) 아이디/비밀번호: 가역 암호화 ──────────────
// 백엔드가 스케줄러에서 골프장 사이트에 자동 로그인하려면 원문을 다시 얻어야 하므로,
// 단방향 해시가 아니라 AES-256-GCM으로 암호화한다. 위 hashPassword와 절대 혼용하지 않는다.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM 권장 IV 길이

function getEncryptionKey(): Buffer {
  const keyB64 = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!keyB64) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다 (골프장 계정 자격증명 암호화에 필요)."
    );
  }
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY는 base64로 인코딩된 32바이트 키여야 합니다.");
  }
  return key;
}

/** 가역 암호화: iv:authTag:ciphertext 를 base64 세그먼트로 이어붙인 문자열을 반환한다. */
export function encryptSecret(plain: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    ":"
  );
}

/** encryptSecret이 만든 문자열을 원문으로 복호화한다. */
export function decryptSecret(encoded: string): string {
  const key = getEncryptionKey();
  const [ivB64, authTagB64, ciphertextB64] = encoded.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("잘못된 형식의 암호화 값입니다.");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}
