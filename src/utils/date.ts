export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(value?: string) {
  if (!value) return "";
  return value;
}
