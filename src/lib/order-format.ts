export function formatOrderCode(orderId: number | string | null | undefined) {
  if (orderId === null || orderId === undefined) return "0000";

  const numericId =
    typeof orderId === "number" ? orderId : Number.parseInt(String(orderId), 10);

  if (!Number.isFinite(numericId)) {
    return String(orderId);
  }

  return String(Math.trunc(numericId)).padStart(4, "0");
}
