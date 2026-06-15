"use client";

import * as React from "react";

function fitPrintablePage() {
  const shells = Array.from(document.querySelectorAll<HTMLElement>("[data-print-shell]"));
  if (!shells.length) return;

  for (const shell of shells) {
    shell.style.setProperty("--print-scale", "1");

    const slots = Array.from(shell.querySelectorAll<HTMLElement>(".print-copy-slot"));
    const contents = Array.from(shell.querySelectorAll<HTMLElement>("[data-print-content]"));
    if (!slots.length || !contents.length) continue;

    let scale = 1;
    const pairCount = Math.min(slots.length, contents.length);

    for (let index = 0; index < pairCount; index += 1) {
      const slot = slots[index];
      const content = contents[index];
      const availableWidth = slot.clientWidth;
      const availableHeight = slot.clientHeight;
      const contentWidth = content.scrollWidth;
      const contentHeight = content.scrollHeight;
      if (!availableWidth || !availableHeight || !contentWidth || !contentHeight) continue;

      const widthScale = availableWidth / contentWidth;
      const heightScale = availableHeight / contentHeight;
      scale = Math.min(scale, widthScale, heightScale);
    }

    shell.style.setProperty("--print-scale", String(scale));
  }
}

export function PrintOnLoad() {
  React.useEffect(() => {
    fitPrintablePage();
    window.addEventListener("beforeprint", fitPrintablePage);
    window.addEventListener("resize", fitPrintablePage);
    const id = window.setTimeout(() => {
      fitPrintablePage();
      window.print();
    }, 200);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("beforeprint", fitPrintablePage);
      window.removeEventListener("resize", fitPrintablePage);
    };
  }, []);

  return null;
}

export function PrintButtons() {
  return (
    <div className="mt-6 flex gap-2 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
      >
        Imprimir
      </button>
      <a href="/pedidos" className="rounded-xl border bg-white px-4 py-3 text-sm font-semibold">
        Voltar
      </a>
    </div>
  );
}
