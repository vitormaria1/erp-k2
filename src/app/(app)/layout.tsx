import type { ReactNode } from "react";

import { Sidebar } from "@/components/sidebar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full">
      <Sidebar />
      <main className="flex-1">{children}</main>
    </div>
  );
}

