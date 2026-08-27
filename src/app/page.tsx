import { redirect } from "next/navigation";
import { getUserIdFromCookieStore } from "@/lib/auth";

export default function RootPage() {
  redirect(getUserIdFromCookieStore() ? "/schedule" : "/login");
}
