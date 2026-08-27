import { ReactNode } from "react";

interface Props {
  label: string;
  htmlFor: string;
  helperText?: string;
  errorText?: string;
  children: ReactNode;
}

// 라벨은 항상 입력 위, 도움말은 입력 아래, 에러는 도움말 자리를 대신한다 — placeholder를
// 라벨 대용으로 쓰지 않는다.
export function Field({ label, htmlFor, helperText, errorText, children }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text-primary">
        {label}
      </label>
      {children}
      {errorText ? (
        <p className="text-sm text-danger">{errorText}</p>
      ) : helperText ? (
        <p className="text-sm text-text-secondary">{helperText}</p>
      ) : null}
    </div>
  );
}
