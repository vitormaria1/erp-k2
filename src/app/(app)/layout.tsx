import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { Sidebar } from "@/components/sidebar";
import { isAuthenticated } from "@/lib/simple-auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full">
      <Sidebar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
