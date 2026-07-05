import fs from "node:fs";
import path from "node:path";

const storeKeys = [
  "customers",
  "customerProfiles",
  "styleAccounts",
  "monthlyStatements",
  "statementItems",
  "statementAdjustments",
  "customerReceipts",
  "receiptAllocations",
];

function resolveStorePath() {
  const configuredPath = process.env.RECONCILIATION_DATA_FILE || process.env.RECONCILIATION_STORE_FILE;
  if (!configuredPath) return path.join(process.cwd(), "server", "data", "reconciliation-store.json");
  return path.isAbsolute(configuredPath) ? configuredPath : path.join(process.cwd(), configuredPath);
}

const storePath = resolveStorePath();
const dataDir = path.dirname(storePath);

export function emptyReconciliationStore() {
  return Object.fromEntries(storeKeys.map((key) => [key, []]));
}

export function normalizeReconciliationStore(store) {
  const source = store && typeof store === "object" ? store : {};
  return Object.fromEntries(storeKeys.map((key) => [key, Array.isArray(source[key]) ? source[key] : []]));
}

export function hasReconciliationData(store) {
  const normalizedStore = normalizeReconciliationStore(store);
  return storeKeys.some((key) => normalizedStore[key].length > 0);
}

export function readReconciliationStore() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(emptyReconciliationStore(), null, 2), "utf8");
  }
  return normalizeReconciliationStore(JSON.parse(fs.readFileSync(storePath, "utf8")));
}

export function writeReconciliationStore(store) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const normalizedStore = normalizeReconciliationStore(store);
  fs.writeFileSync(storePath, JSON.stringify(normalizedStore, null, 2), "utf8");
  return normalizedStore;
}

function mergeRows(currentRows, incomingRows) {
  const byId = new Map();
  for (const row of currentRows) {
    if (row?.id) byId.set(row.id, row);
  }
  for (const row of incomingRows) {
    if (row?.id) byId.set(row.id, row);
  }
  return Array.from(byId.values());
}

export function mergeReconciliationStore(incomingStore) {
  const currentStore = readReconciliationStore();
  const normalizedIncoming = normalizeReconciliationStore(incomingStore);
  const mergedStore = Object.fromEntries(
    storeKeys.map((key) => [key, mergeRows(currentStore[key], normalizedIncoming[key])]),
  );
  return writeReconciliationStore(mergedStore);
}
