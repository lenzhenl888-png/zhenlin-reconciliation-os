import type { CustomerProfile, CustomerProfileStatus, CustomerType } from "../models";

export type CustomerProfileImportRow = {
  fields: Partial<CustomerProfile>;
  sourceRow: number;
};

export type CustomerProfileImportParseResult = {
  rows: CustomerProfileImportRow[];
  warnings: string[];
};

const fieldAliases: Array<{ key: keyof CustomerProfile; aliases: string[] }> = [
  { key: "id", aliases: ["客户ID", "客户id", "客户ID（可选，用于更新）", "customerId", "id"] },
  { key: "shortName", aliases: ["客户简称", "客户简称（必填）", "简称"] },
  { key: "fullName", aliases: ["客户全称", "客户全称（必填）", "全称"] },
  { key: "customerType", aliases: ["客户类型"] },
  { key: "status", aliases: ["客户状态", "状态"] },
  { key: "contactName", aliases: ["联系人"] },
  { key: "mobile", aliases: ["手机号", "手机"] },
  { key: "phone", aliases: ["电话"] },
  { key: "wechat", aliases: ["微信"] },
  { key: "email", aliases: ["邮箱", "电子邮箱"] },
  { key: "invoiceTitle", aliases: ["开票抬头"] },
  { key: "taxNumber", aliases: ["纳税人识别号", "税号"] },
  { key: "invoiceAddress", aliases: ["开票地址"] },
  { key: "invoicePhone", aliases: ["开票电话"] },
  { key: "bankName", aliases: ["开户银行"] },
  { key: "bankAccount", aliases: ["银行账号", "银行账户"] },
  { key: "defaultPaymentTerm", aliases: ["默认账期"] },
  { key: "statementDay", aliases: ["默认对账日"] },
  { key: "paymentDay", aliases: ["默认付款日"] },
  { key: "currency", aliases: ["币种"] },
  { key: "needInvoiceBeforePayment", aliases: ["是否需要发票后付款"] },
  { key: "shippingAddress", aliases: ["收货地址"] },
  { key: "invoiceMailingAddress", aliases: ["寄票地址"] },
  { key: "note", aliases: ["备注"] },
];

const customerTypes: CustomerType[] = ["品牌客户", "贸易客户", "服装厂", "其他"];
const profileStatuses: CustomerProfileStatus[] = ["正常", "暂停合作"];

export async function readCustomerProfileImportFile(file: File): Promise<CustomerProfileImportParseResult> {
  const rows = await readSpreadsheetRows(file);

  return rowsToCustomerProfiles(rows);
}

export async function readSpreadsheetRows(file: File): Promise<string[][]> {
  return file.name.toLowerCase().endsWith(".csv")
    ? parseCsvRows(await file.text())
    : await readXlsxRows(file);
}

function rowsToCustomerProfiles(rows: string[][]): CustomerProfileImportParseResult {
  const warnings: string[] = [];
  const headerRowIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return normalized.includes(normalizeHeader("客户简称")) && normalized.includes(normalizeHeader("客户全称"));
  });

  if (headerRowIndex < 0) {
    return {
      rows: [],
      warnings: ["没有找到表头行，请确认 Excel 中包含“客户简称”和“客户全称”两列。"],
    };
  }

  const headerMap = buildHeaderMap(rows[headerRowIndex]);
  const parsedRows: CustomerProfileImportRow[] = [];

  rows.slice(headerRowIndex + 1).forEach((row, offset) => {
    const sourceRow = headerRowIndex + offset + 2;
    if (row.every((cell) => !String(cell ?? "").trim())) return;

    const fields: Partial<CustomerProfile> = {};
    for (const { key } of fieldAliases) {
      const index = headerMap.get(key);
      if (index === undefined) continue;
      const value = normalizeCell(row[index]);
      if (!value) continue;

      if (key === "customerType") {
        if (customerTypes.includes(value as CustomerType)) {
          fields.customerType = value as CustomerType;
        } else {
          warnings.push(`第 ${sourceRow} 行客户类型“${value}”无效，已按“其他”处理。`);
          fields.customerType = "其他";
        }
      } else if (key === "status") {
        if (profileStatuses.includes(value as CustomerProfileStatus)) {
          fields.status = value as CustomerProfileStatus;
        } else {
          warnings.push(`第 ${sourceRow} 行客户状态“${value}”无效，已按“正常”处理。`);
          fields.status = "正常";
        }
      } else if (key === "needInvoiceBeforePayment") {
        const booleanValue = parseBooleanValue(value);
        if (booleanValue === undefined) {
          warnings.push(`第 ${sourceRow} 行“是否需要发票后付款”请填写“是”或“否”，该值已忽略。`);
        } else {
          fields.needInvoiceBeforePayment = booleanValue;
        }
      } else {
        fields[key] = value as never;
      }
    }

    parsedRows.push({ fields, sourceRow });
  });

  return { rows: parsedRows, warnings };
}

function buildHeaderMap(headers: string[]) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const headerMap = new Map<keyof CustomerProfile, number>();
  for (const { key, aliases } of fieldAliases) {
    const index = normalizedHeaders.findIndex((header) => aliases.map(normalizeHeader).includes(header));
    if (index >= 0) headerMap.set(key, index);
  }
  return headerMap;
}

function normalizeHeader(value: string) {
  return String(value ?? "")
    .replace(/\s/g, "")
    .replace(/[()（）]/g, "")
    .toLowerCase();
}

function normalizeCell(value: unknown) {
  const text = String(value ?? "").trim();
  if (!/e[+-]?\d+$/i.test(text)) return text;
  const numberValue = Number(text);
  return Number.isFinite(numberValue) ? numberValue.toLocaleString("fullwide", { useGrouping: false }) : text;
}

function parseBooleanValue(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["是", "yes", "y", "true", "1"].includes(normalized)) return true;
  if (["否", "no", "n", "false", "0"].includes(normalized)) return false;
  return undefined;
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

async function readXlsxRows(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = readZipEntries(bytes);
  const sharedStrings = entries.has("xl/sharedStrings.xml")
    ? parseSharedStrings(await decodeZipEntry(entries.get("xl/sharedStrings.xml")!))
    : [];

  const worksheetPath = await getFirstWorksheetPath(entries);
  const worksheetXml = await decodeZipEntry(entries.get(worksheetPath)!);
  return parseWorksheetRows(worksheetXml, sharedStrings);
}

type ZipEntry = {
  compressedData: Uint8Array;
  compressedSize: number;
  compressionMethod: number;
  name: string;
};

function readZipEntries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocdOffset = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 66_000); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("无法读取 Excel 文件，请确认文件格式为 .xlsx。");

  const entryCount = view.getUint16(eocdOffset + 10, true);
  let centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const entries = new Map<string, ZipEntry>();

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(centralDirectoryOffset, true) !== 0x02014b50) break;
    const compressionMethod = view.getUint16(centralDirectoryOffset + 10, true);
    const compressedSize = view.getUint32(centralDirectoryOffset + 20, true);
    const fileNameLength = view.getUint16(centralDirectoryOffset + 28, true);
    const extraLength = view.getUint16(centralDirectoryOffset + 30, true);
    const commentLength = view.getUint16(centralDirectoryOffset + 32, true);
    const localHeaderOffset = view.getUint32(centralDirectoryOffset + 42, true);
    const name = new TextDecoder().decode(bytes.slice(centralDirectoryOffset + 46, centralDirectoryOffset + 46 + fileNameLength));

    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    entries.set(name.replace(/\\/g, "/"), {
      compressedData: bytes.slice(dataStart, dataStart + compressedSize),
      compressedSize,
      compressionMethod,
      name,
    });
    centralDirectoryOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

async function decodeZipEntry(entry: ZipEntry) {
  const responseBytes = entry.compressedData;
  if (entry.compressionMethod === 0) return decodeUtf8(responseBytes);
  if (entry.compressionMethod !== 8) throw new Error(`不支持的 Excel 压缩格式：${entry.compressionMethod}`);

  const DecompressionStreamCtor = (globalThis as typeof globalThis & {
    DecompressionStream?: new (format: string) => TransformStream<Uint8Array, Uint8Array>;
  }).DecompressionStream;
  if (!DecompressionStreamCtor) throw new Error("当前浏览器不支持 Excel 解压，请使用最新版 Chrome 或 Edge。");

  const copiedBytes = new Uint8Array(responseBytes.byteLength);
  copiedBytes.set(responseBytes);
  const stream = new Blob([copiedBytes.buffer]).stream().pipeThrough(new DecompressionStreamCtor("deflate-raw"));
  const decompressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return decodeUtf8(decompressed);
}

async function getFirstWorksheetPath(entries: Map<string, ZipEntry>) {
  const directSheet = "xl/worksheets/sheet1.xml";
  if (entries.has(directSheet)) return directSheet;

  const workbookXml = entries.get("xl/workbook.xml");
  const workbookRels = entries.get("xl/_rels/workbook.xml.rels");
  if (!workbookXml || !workbookRels) throw new Error("Excel 文件缺少工作表信息。");

  const workbook = parseXml(await decodeZipEntry(workbookXml));
  const firstSheet = workbook.getElementsByTagName("sheet")[0];
  const relationId = firstSheet?.getAttribute("r:id");
  if (!relationId) throw new Error("Excel 文件缺少工作表关系。");

  const rels = parseXml(await decodeZipEntry(workbookRels));
  const relation = Array.from(rels.getElementsByTagName("Relationship")).find((item) => item.getAttribute("Id") === relationId);
  const target = relation?.getAttribute("Target")?.replace(/^\//, "");
  if (!target) throw new Error("Excel 文件缺少工作表路径。");
  const path = target.startsWith("xl/") ? target : `xl/${target}`;
  if (!entries.has(path)) throw new Error("找不到 Excel 第一张工作表。");
  return path;
}

function parseSharedStrings(xml: string) {
  const doc = parseXml(xml);
  return Array.from(doc.getElementsByTagName("si")).map((item) =>
    Array.from(item.getElementsByTagName("t"))
      .map((textNode) => textNode.textContent ?? "")
      .join(""),
  );
}

function parseWorksheetRows(xml: string, sharedStrings: string[]) {
  const doc = parseXml(xml);
  const rows: string[][] = [];

  Array.from(doc.getElementsByTagName("row")).forEach((rowNode) => {
    const rowIndex = Number(rowNode.getAttribute("r") ?? rows.length + 1) - 1;
    const row: string[] = rows[rowIndex] ?? [];
    Array.from(rowNode.getElementsByTagName("c")).forEach((cellNode) => {
      const reference = cellNode.getAttribute("r") ?? "";
      const columnIndex = columnNameToIndex(reference.replace(/\d/g, ""));
      const type = cellNode.getAttribute("t");
      const valueNode = cellNode.getElementsByTagName("v")[0];
      let value = "";
      if (type === "s" && valueNode?.textContent) {
        value = sharedStrings[Number(valueNode.textContent)] ?? "";
      } else if (type === "inlineStr") {
        value = Array.from(cellNode.getElementsByTagName("t"))
          .map((item) => item.textContent ?? "")
          .join("");
      } else {
        value = valueNode?.textContent ?? "";
      }
      row[columnIndex] = value;
    });
    rows[rowIndex] = row;
  });

  return rows.map((row) => row ?? []);
}

function columnNameToIndex(columnName: string) {
  return columnName.split("").reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function parseXml(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const error = doc.getElementsByTagName("parsererror")[0];
  if (error) throw new Error("Excel XML 解析失败。");
  return doc;
}

function decodeUtf8(bytes: Uint8Array) {
  return new TextDecoder("utf-8").decode(bytes);
}
