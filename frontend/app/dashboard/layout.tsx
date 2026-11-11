import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import { SESSION_COOKIE_NAME, hasLiveSessionToken } from "@/lib/sessionCookie";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!hasLiveSessionToken(token)) {
    redirect("/login");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
