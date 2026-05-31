"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function FiscalInlineWorkerClient() {
  const router = useRouter();

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_FISCAL_INLINE_WORKER === "0") return;

    let stopped = false;
    async function tick() {
      try {
        const r = await fetch("/api/fiscal/worker/tick", { method: "POST" });
        if (!r.ok) return;
        const body = (await r.json()) as { handled?: number };
        if ((body.handled ?? 0) > 0) router.refresh();
      } catch {
        // ignore
      }
    }

    const interval = setInterval(() => {
      if (stopped) return;
      void tick();
    }, 4000);

    void tick();
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [router]);

  return null;
}

