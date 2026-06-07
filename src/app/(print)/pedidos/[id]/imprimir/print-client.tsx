"use client";

import * as React from "react";

function fitPrintablePage() {
  const shell = document.getElementById("print-fit-shell");
  const content = shell?.querySelector<HTMLElement>("[data-print-content]");
  const slot = shell?.querySelector<HTMLElement>(".print-copy-slot");
  if (!shell || !content || !slot) return;

  shell.style.setProperty("--print-scale", "1");

  const slotRect = slot.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();
  if (!slotRect.width || !slotRect.height || !contentRect.width || !contentRect.height) return;

  const availableHeight = slotRect.height;
  const widthScale = slotRect.width / contentRect.width;
  const heightScale = availableHeight / contentRect.height;
  const scale = Math.min(1, widthScale, heightScale);

  shell.style.setProperty("--print-scale", String(scale));
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
