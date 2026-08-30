"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/components/app/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { FACILITIES } from "@/lib/facilities";
import { PlusCircle, Trash, X, Warning } from "@phosphor-icons/react/dist/ssr";

interface WatchCondition {
  id: string;
  dates: string[];
  timeStart: string;
  timeEnd: string;
}

interface Credential {
  id: string;
  facilityId: string;
  status: "ACTIVE" | "PAUSED_LOGIN_FAILED";
  lastError: string | null;
}

export default function SettingsPage() {
  const router = useRouter();
  const [conditions, setConditions] = useState<WatchCondition[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    const [conditionsRes, credentialsRes] = await Promise.all([
      fetch("/api/conditions"),
      fetch("/api/credentials"),
    ]);
    setConditions(await conditionsRes.json());
    setCredentials(await credentialsRes.json());
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  return (
    <div className="min-h-[100dvh]">
      <AppNav />
      <main className="mx-auto flex max-w-2xl flex-col gap-10 px-4 py-8 sm:px-6">
        <ConditionsSection conditions={conditions} loading={loading} onChanged={reload} />
        <CredentialsSection credentials={credentials} loading={loading} onChanged={reload} />
        <DangerZone />
      </main>
    </div>
  );

  function DangerZone() {
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleDelete() {
      const res = await fetch("/api/auth/delete-account", { method: "DELETE" });
      if (!res.ok) {
        setError("탈퇴에 실패했어요. 잠시 후 다시 시도해주세요.");
        return;
      }
      router.push("/login");
      router.refresh();
    }

    return (
      <section className="flex flex-col gap-3 rounded-xl border border-danger/30 p-4">
        <h2 className="text-sm font-medium text-danger">계정 탈퇴</h2>
        <p className="text-sm text-text-secondary">
          탈퇴하면 등록된 골프장 계정 정보와 관심조건이 모두 완전히 삭제되고 되돌릴 수 없어요.
        </p>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {confirming ? (
          <div className="flex items-center gap-2">
            <Button variant="danger" onClick={handleDelete}>
              정말 탈퇴할게요
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              취소
            </Button>
          </div>
        ) : (
          <Button variant="danger" className="w-fit" onClick={() => setConfirming(true)}>
            계정 탈퇴
          </Button>
        )}
      </section>
    );
  }
}

function ConditionsSection({
  conditions,
  loading,
  onChanged,
}: {
  conditions: WatchCondition[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [dates, setDates] = useState<string[]>([]);
  const [dateInput, setDateInput] = useState("");
  const [timeStart, setTimeStart] = useState("06:00");
  const [timeEnd, setTimeEnd] = useState("12:00");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function addDate() {
    if (dateInput && !dates.includes(dateInput)) setDates([...dates, dateInput].sort());
    setDateInput("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (dates.length === 0) {
      setError("날짜를 하나 이상 추가해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/conditions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dates, timeStart, timeEnd }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "등록에 실패했어요.");
        return;
      }
      setDates([]);
      onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/conditions/${id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-text-primary">관심 날짜</h1>
        <p className="mt-1 text-sm text-text-secondary">
          원하는 날짜와 시간대를 등록해두면, 그 조건에 맞는 취소표가 나올 때 알려드려요.
        </p>
      </div>

      {loading ? null : conditions.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
          {conditions.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div>
                <p className="flex flex-wrap gap-1.5 text-sm font-medium text-text-primary">
                  {c.dates.map((d) => (
                    <span key={d} className="rounded-full bg-surface-elevated px-2 py-0.5">
                      {d}
                    </span>
                  ))}
                </p>
                <p className="mt-1.5 text-xs text-text-secondary">
                  {c.timeStart} ~ {c.timeEnd}
                </p>
              </div>
              <button
                onClick={() => handleDelete(c.id)}
                aria-label="관심조건 삭제"
                className="shrink-0 rounded-lg p-2 text-text-secondary transition hover:bg-danger-surface hover:text-danger"
              >
                <Trash size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border p-4">
        <Field label="날짜 추가" htmlFor="date-input" helperText="원하는 날짜를 하나씩 추가하세요.">
          <div className="flex gap-2">
            <Input
              id="date-input"
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
            />
            <Button type="button" variant="secondary" onClick={addDate}>
              <PlusCircle size={16} />
              추가
            </Button>
          </div>
        </Field>
        {dates.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {dates.map((d) => (
              <span
                key={d}
                className="flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent"
              >
                {d}
                <button type="button" onClick={() => setDates(dates.filter((x) => x !== d))}>
                  <X size={12} weight="bold" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="시작 시간" htmlFor="time-start">
            <Input id="time-start" type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} />
          </Field>
          <Field label="종료 시간" htmlFor="time-end">
            <Input id="time-end" type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} />
          </Field>
        </div>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button type="submit" disabled={submitting} className="w-fit">
          {submitting ? "등록하는 중..." : "관심조건 등록"}
        </Button>
      </form>
    </section>
  );
}

function CredentialsSection({
  credentials,
  loading,
  onChanged,
}: {
  credentials: Credential[];
  loading: boolean;
  onChanged: () => void;
}) {
  const registeredFacilityIds = new Set(credentials.map((c) => c.facilityId));
  const availableFacilities = FACILITIES.filter((f) => !registeredFacilityIds.has(f.id));

  const [facilityId, setFacilityId] = useState(availableFacilities[0]?.id ?? "");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedLoginless = FACILITIES.find((f) => f.id === facilityId)?.loginless === true;

  useEffect(() => {
    if (!facilityId && availableFacilities[0]) setFacilityId(availableFacilities[0].id);
  }, [availableFacilities, facilityId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          selectedLoginless ? { facilityId } : { facilityId, loginId, password }
        ),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "등록에 실패했어요.");
        return;
      }
      setLoginId("");
      setPassword("");
      onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/credentials/${id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-text-primary">감시할 골프장</h2>
        <p className="mt-1 text-sm text-text-secondary">
          계정이 필요한 골프장은 등록한 계정으로 앱이 자동 로그인해 취소표를 확인해요(비밀번호는
          암호화 저장). 일부 골프장은 로그인 없이 비회원 화면으로 감시해요.
        </p>
      </div>

      {loading ? null : credentials.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
          {credentials.map((c) => (
            <CredentialRow key={c.id} credential={c} onDelete={handleDelete} onChanged={onChanged} />
          ))}
        </ul>
      ) : null}

      {availableFacilities.length > 0 ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border p-4">
          <Field label="골프장" htmlFor="facility">
            <select
              id="facility"
              value={facilityId}
              onChange={(e) => setFacilityId(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
            >
              {availableFacilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
          {selectedLoginless ? (
            <p className="text-sm text-text-secondary">
              이 골프장은 로그인 없이 감시해요. 계정 정보가 필요 없어요. 취소표가 뜨면 알림을
              보내드리니, 알림에서 예약 페이지로 이동해 직접 로그인하고 예약하시면 돼요.
            </p>
          ) : (
            <>
              <Field label="아이디" htmlFor="loginId">
                <Input id="loginId" required value={loginId} onChange={(e) => setLoginId(e.target.value)} />
              </Field>
              <Field label="비밀번호" htmlFor="facility-password">
                <Input
                  id="facility-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            </>
          )}
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Button type="submit" disabled={submitting} className="w-fit">
            {submitting ? "등록하는 중..." : selectedLoginless ? "감시 추가" : "계정 등록"}
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function CredentialRow({
  credential,
  onDelete,
  onChanged,
}: {
  credential: Credential;
  onDelete: (id: string) => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const facility = FACILITIES.find((f) => f.id === credential.facilityId);
  const loginless = facility?.loginless === true;

  async function handleUpdate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/credentials/${credential.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(loginId ? { loginId } : {}),
          ...(password ? { password } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "갱신에 실패했어요.");
        return;
      }
      setEditing(false);
      setLoginId("");
      setPassword("");
      onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-primary">
            {facility?.name ?? credential.facilityId}
          </p>
          {credential.status === "PAUSED_LOGIN_FAILED" ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-danger">
              <Warning size={13} weight="bold" />
              로그인 실패로 감시가 중지됐어요.
            </p>
          ) : (
            <p className="mt-1 text-xs text-text-secondary">
              {loginless ? "감시 중 (로그인 없음)" : "정상 감시 중"}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {loginless ? null : (
            <Button variant="ghost" onClick={() => setEditing((v) => !v)}>
              계정 정보 갱신
            </Button>
          )}
          <button
            onClick={() => onDelete(credential.id)}
            aria-label={loginless ? "감시 삭제" : "계정 삭제"}
            className="rounded-lg p-2 text-text-secondary transition hover:bg-danger-surface hover:text-danger"
          >
            <Trash size={16} />
          </button>
        </div>
      </div>
      {editing && !loginless ? (
        <form onSubmit={handleUpdate} className="flex flex-col gap-3 rounded-lg bg-surface-elevated p-3">
          <Field label="새 아이디 (변경 시에만 입력)" htmlFor={`loginId-${credential.id}`}>
            <Input id={`loginId-${credential.id}`} value={loginId} onChange={(e) => setLoginId(e.target.value)} />
          </Field>
          <Field label="새 비밀번호 (변경 시에만 입력)" htmlFor={`password-${credential.id}`}>
            <Input
              id={`password-${credential.id}`}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Button type="submit" disabled={submitting} className="w-fit">
            {submitting ? "저장하는 중..." : "저장하고 감시 재개"}
          </Button>
        </form>
      ) : null}
    </li>
  );
}
