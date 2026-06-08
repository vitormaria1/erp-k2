export const ORDER_STATUS_VALUES = [
  "FEITO",
  "SEPARADO",
  "ENVIADO",
  "ENTREGUE",
] as const;

export type OrderStatus = (typeof ORDER_STATUS_VALUES)[number];

const ORDER_STATUS_META: Record<OrderStatus, { label: string; className: string }> = {
  FEITO: {
    label: "Feito",
    className: "bg-amber-100 text-amber-800",
  },
  SEPARADO: {
    label: "Separado",
    className: "bg-sky-100 text-sky-800",
  },
  ENVIADO: {
    label: "Enviado",
    className: "bg-violet-100 text-violet-800",
  },
  ENTREGUE: {
    label: "Entregue",
    className: "bg-emerald-100 text-emerald-800",
  },
};

export function isOrderStatus(value: string): value is OrderStatus {
  return ORDER_STATUS_VALUES.includes(value as OrderStatus);
}

export function getOrderStatusMeta(status: string) {
  const normalized = normalizeOrderStatus(status);
  if (isOrderStatus(normalized)) {
    return ORDER_STATUS_META[normalized];
  }

  return {
    label: status,
    className: "bg-black/[0.05] text-[var(--muted)]",
  };
}

export function normalizeOrderStatus(status: string): OrderStatus | string {
  switch (status) {
    case "PENDING":
      return "FEITO";
    case "CONFIRMED":
      return "SEPARADO";
    case "IN_PRODUCTION":
      return "SEPARADO";
    case "READY":
      return "ENVIADO";
    case "DELIVERED":
      return "ENTREGUE";
    case "PAGO":
      return "ENTREGUE";
    case "CANCELED":
      return "FEITO";
    default:
      return status;
  }
}
