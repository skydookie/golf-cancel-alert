"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarCheck, Gear, SignOut } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="flex h-16 items-center justify-between border-b border-border px-4 sm:px-6">
      <div className="flex items-center gap-6">
        <span className="text-sm font-semibold tracking-tight text-text-primary">취소표 알림</span>
        <div className="flex items-center gap-1">
          <NavLink href="/schedule" active={pathname === "/schedule"}>
            <CalendarCheck size={17} weight={pathname === "/schedule" ? "fill" : "regular"} />
            취소표
          </NavLink>
          <NavLink href="/settings" active={pathname === "/settings"}>
            <Gear size={17} weight={pathname === "/settings" ? "fill" : "regular"} />
            설정
          </NavLink>
        </div>
      </div>
      <button
        onClick={handleLogout}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-text-secondary transition hover:text-text-primary"
      >
        <SignOut size={16} />
        로그아웃
      </button>
    </nav>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
        active ? "bg-surface-elevated text-text-primary" : "text-text-secondary hover:text-text-primary"
      )}
    >
      {children}
    </Link>
  );
}
