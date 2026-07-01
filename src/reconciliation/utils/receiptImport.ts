import type { PaymentMethod } from "../models";
import { readSpreadsheetRows } from "./customerProfileImport";

export type ReceiptImportRow = {
  amount: number;
  customerName: string;
  method: PaymentMethod;
  note: string;
  receiptDate: string;
  sourceRow: number;
  transactionNo: string;
};

export type ReceiptImportResult = {
  rows: ReceiptImportRow[];
  warnings: string[];
};

const methodOptions: PaymentMethod[] = ["银行转账", "承兑汇票", "现金", "支付宝", "微信", "其他"];

const columnAliases = {
  amount: ["金额", "收款金额"],
  customerName: ["客户", "客户名称", "客户简称", "客户全称"],
  method: ["收款方式", "方式"],
  note: ["备注"],
  receiptDate: ["收款日期", "日期"],
  transactionNo: ["流水号", "银行流水号", "流水号/承兑编号", "流水号 / 承兑编号", "承兑编号"],
} as const;

export async function readReceiptImportFile(file: File): Promise<ReceiptImportResult> {
  const rows = await readSpreadsheetRows(file);
  return parseReceiptRows(rows);
}

function parseReceiptRows(rows: string[][]): ReceiptImportResult {
  const warnings: string[] = [];
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return normalized.includes(normalizeHeader("客户")) && normalized.includes(normalizeHeader("收款日期")) && normalized.includes(normalizeHeader("金额"));
  });

  if (headerIndex < 0) {
    return {
      rows: [],
      warnings: ["没有找到表头行，请确认 Excel 包含：客户、收款日期、金额。"],
    };
  }

  const headerMap = buildHeaderMap(rows[headerIndex]);
  const parsedRows: ReceiptImportRow[] = [];

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const sourceRow = headerIndex + offset + 2;
    if (row.every((cell) => !String(cell ?? "").trim())) return;

    const customerName = getCell(row, headerMap.customerName);
    const receiptDate = normalizeDate(getCell(row, headerMap.receiptDate));
    const amount = parseAmount(getCell(row, headerMap.amount));
    const method = normalizeMethod(getCell(row, headerMap.method));
    const transactionNo = getCell(row, headerMap.transactionNo);
    const note = getCell(row, headerMap.note);

    if (!customerName) {
      warnings.push(`第 ${sourceRow} 行客户为空，已跳过。`);
      return;
    }
    if (!receiptDate) {
      warnings.push(`第 ${sourceRow} 行收款日期无效，已跳过。`);
      return;
    }
    if (amount <= 0) {
      warnings.push(`第 ${sourceRow} 行金额必须大于 0，已跳过。`);
      return;
    }

    parsedRows.push({
      amount,
      customerName,
      method,
      note,
      receiptDate,
      sourceRow,
      transactionNo,
    });
  });

  return { rows: parsedRows, warnings };
}

function buildHeaderMap(headers: string[]) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const findIndex = (aliases: readonly string[]) => normalizedHeaders.findIndex((header) => aliases.map(normalizeHeader).includes(header));

  return {
    amount: findIndex(columnAliases.amount),
    customerName: findIndex(columnAliases.customerName),
    method: findIndex(columnAliases.method),
    note: findIndex(columnAliases.note),
    receiptDate: findIndex(columnAliases.receiptDate),
    transactionNo: findIndex(columnAliases.transactionNo),
  };
}

function getCell(row: string[], index: number) {
  return index >= 0 ? String(row[index] ?? "").trim() : "";
}

function normalizeHeader(value: string) {
  return String(value ?? "")
    .replace(/\s/g, "")
    .replace(/[()（）]/g, "")
    .toLowerCase();
}

function parseAmount(value: string) {
  const parsed = Number(value.replace(/[¥￥,\s]/g, ""));
  return Math.round((Number.isFinite(parsed) ? parsed : 0) * 100) / 100;
}

function normalizeDate(value: string) {
  const text = value.trim();
  if (!text) return "";

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [year, month, day] = text.split("-");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(text)) {
    const [left, middle, year] = text.split(/[/-]/);
    return `${year}-${middle.padStart(2, "0")}-${left.padStart(2, "0")}`;
  }

  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 20_000) {
    const utcDays = Math.floor(serial - 25569);
    const date = new Date(utcDays * 86_400_000);
    return date.toISOString().slice(0, 10);
  }

  return "";
}

function normalizeMethod(value: string): PaymentMethod {
  return methodOptions.includes(value as PaymentMethod) ? (value as PaymentMethod) : "银行转账";
}
