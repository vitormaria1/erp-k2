"use client";

import { useEffect, useRef } from "react";

type Props = {
  invoiceId: string;
  internalStatus: string | null;
  autoOpenDanfe: boolean;
};

export function AuthorizedInvoiceClient({ invoiceId, internalStatus, autoOpenDanfe }: Props) {
  const openedRef = useRef(false);

  useEffect(() => {
    if (!autoOpenDanfe || internalStatus !== "AUTHORIZED" || openedRef.current) return;

    openedRef.current = true;
    window.location.replace(`/api/fiscal/invoices/${encodeURIComponent(invoiceId)}/danfe`);
  }, [autoOpenDanfe, internalStatus, invoiceId]);

  return null;
}
