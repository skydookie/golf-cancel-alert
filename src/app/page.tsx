import { redirect } from "next/navigation";
import { getUserIdFromCookieStore } from "@/lib/auth";

export default async function RootPage() {
  redirect((await getUserIdFromCookieStore()) ? "/schedule" : "/login");
}
