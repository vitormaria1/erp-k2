"use client";

import * as React from "react";

export function PrintOnLoad() {
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      window.print();
    }, 200);
    return () => window.clearTimeout(id);
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
