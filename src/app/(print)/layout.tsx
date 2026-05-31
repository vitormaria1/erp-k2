import type { ReactNode } from "react";

export default function PrintLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-full bg-white text-black">{children}</div>;
}

