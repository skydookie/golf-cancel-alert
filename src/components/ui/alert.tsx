import { ReactNode } from "react";
import { WarningCircle, CheckCircle } from "@phosphor-icons/react/dist/ssr";

export function Alert({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  if (tone === "error") {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-danger-surface px-3 py-2.5 text-sm text-danger">
        <WarningCircle size={18} weight="bold" className="mt-0.5 shrink-0" />
        <span>{children}</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2.5 text-sm text-accent">
      <CheckCircle size={18} weight="bold" className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
