"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, inviteCode }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "가입에 실패했습니다.");
        return;
      }
      router.push("/schedule");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold tracking-tight text-text-primary">회원가입</h1>
        <p className="mb-6 text-sm text-text-secondary">
          지인에게 받은 초대코드가 있어야 가입할 수 있어요.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="초대코드" htmlFor="inviteCode">
            <Input
              id="inviteCode"
              required
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />
          </Field>
          <Field label="이메일" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="비밀번호" htmlFor="password" helperText="8자 이상으로 설정해주세요.">
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? "가입하는 중..." : "가입하기"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-text-secondary">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </main>
  );
}
