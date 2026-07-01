export function toNumber(value: number | string | undefined) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
