import { readSpreadsheetRows } from "./customerProfileImport";

export type InvoiceImportRow = {
  amount: number;
  customerName: string;
  invoiceDate: string;
  invoiceNo: string;
  note: string;
  sourceRow: number;
  styleNo: string;
};

export type InvoiceImportResult = {
  rows: InvoiceImportRow[];
  warnings: string[];
};

const columnAliases = {
  amount: ["开票金额", "发票金额", "金额", "价税合计", "合计金额", "含税金额", "不含税金额"],
  customerName: ["客户", "客户名称", "客户简称", "客户全称", "购方名称", "购买方名称", "购买方", "对方户名"],
  invoiceDate: ["开票日期", "发票日期", "日期", "业务日期"],
  invoiceNo: ["发票号码", "发票号", "发票编号", "号码", "数电票号码", "电子发票号码"],
  note: ["备注", "摘要", "商品名称", "项目名称"],
  styleNo: ["款号", "货号", "订单号", "客户款号", "规格型号", "型号"],
} as const;

export async function readInvoiceImportFile(file: File): Promise<InvoiceImportResult> {
  const rows = await readSpreadsheetRows(file);
  return parseInvoiceRows(rows);
}

function parseInvoiceRows(rows: string[][]): InvoiceImportResult {
  const warnings: string[] = [];
  const headerIndex = rows.findIndex((row) => {
    const headerMap = buildHeaderMap(row);
    return headerMap.customerName >= 0 && headerMap.invoiceDate >= 0 && headerMap.amount >= 0;
  });

  if (headerIndex < 0) {
    return {
      rows: [],
      warnings: ["没有找到表头行，请确认 Excel 至少包含：客户/购方名称、开票日期、开票金额。"],
    };
  }

  const headerMap = buildHeaderMap(rows[headerIndex]);
  const parsedRows: InvoiceImportRow[] = [];

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const sourceRow = headerIndex + offset + 2;
    if (row.every((cell) => !String(cell ?? "").trim())) return;

    const customerName = getCell(row, headerMap.customerName);
    const invoiceDate = normalizeDate(getCell(row, headerMap.invoiceDate));
    const amount = parseAmount(getCell(row, headerMap.amount));
    const invoiceNo = getCell(row, headerMap.invoiceNo);
    const styleNo = getCell(row, headerMap.styleNo);
    const note = getCell(row, headerMap.note);

    if (!customerName) {
      warnings.push(`第 ${sourceRow} 行客户/购方名称为空，已跳过。`);
      return;
    }
    if (!invoiceDate) {
      warnings.push(`第 ${sourceRow} 行开票日期无效，已跳过。`);
      return;
    }
    if (amount <= 0) {
      warnings.push(`第 ${sourceRow} 行开票金额必须大于 0，已跳过。`);
      return;
    }

    parsedRows.push({
      amount,
      customerName,
      invoiceDate,
      invoiceNo,
      note,
      sourceRow,
      styleNo,
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
    invoiceDate: findIndex(columnAliases.invoiceDate),
    invoiceNo: findIndex(columnAliases.invoiceNo),
    note: findIndex(columnAliases.note),
    styleNo: findIndex(columnAliases.styleNo),
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
