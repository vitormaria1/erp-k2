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
      <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
