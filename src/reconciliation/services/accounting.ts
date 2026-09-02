import type {
  AccountStatus,
  Customer,
  CustomerProfile,
  CustomerReceipt,
  CustomerSummary,
  InvoiceStatus,
  MonthlyStatement,
  MonthlyStatementSummary,
  PaymentStatus,
  ReceiptAllocation,
  ReconciliationStore,
  StatementAdjustment,
  StatementItem,
  StatementItemSummary,
  StyleAccount,
  StyleAccountSummary,
} from "../models";

export function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function formatMoney(value: number) {
  return roundMoney(value).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function parseMoney(value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return roundMoney(Number.isFinite(parsed) ? parsed : 0);
}

export function sumMoney(values: number[]) {
  return roundMoney(values.reduce((total, value) => total + roundMoney(value), 0));
}

export function getPeriodFromDate(date: string) {
  return date.slice(0, 7);
}

export function getCurrentPeriod() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 7);
}

export function summarizeStyleAccount(account: StyleAccount): StyleAccountSummary {
  const receivableTotal = sumMoney(account.receivableRecords.map((record) => record.amount));
  const invoicedTotal = sumMoney(account.invoiceRecords.map((record) => record.amount));
  const paidTotal = sumMoney(account.paymentRecords.map((record) => record.amount));
  const uninvoicedAmount = roundMoney(Math.max(receivableTotal - invoicedTotal, 0));
  const unpaidAmount = roundMoney(Math.max(receivableTotal - paidTotal, 0));
  const invoiceStatus = getInvoiceStatus(receivableTotal, invoicedTotal);
  const paymentStatus = getPaymentStatus(receivableTotal, paidTotal);

  return {
    receivableTotal,
    invoicedTotal,
    uninvoicedAmount,
    paidTotal,
    unpaidAmount,
    invoiceStatus,
    paymentStatus,
    statusLabels: buildStatusLabels(invoiceStatus, paymentStatus),
  };
}

export function getCustomerProfile(customerId: string, store: ReconciliationStore): CustomerProfile | undefined {
  return store.customerProfiles?.find((profile) => profile.id === customerId);
}

export function getCustomerDisplayName(customerId: string, store: ReconciliationStore) {
  const profile = getCustomerProfile(customerId, store);
  const legacyCustomer = store.customers.find((customer) => customer.id === customerId);
  return profile?.shortName || profile?.fullName || legacyCustomer?.name || "未命名客户";
}

export function summarizeStatement(statement: MonthlyStatement, store: ReconciliationStore): MonthlyStatementSummary {
  const openingBalance = roundMoney(statement.openingBalance);
  const realtimeOpeningBalance = getRealtimeOpeningBalance(statement, store);
  const items = store.statementItems
    .filter((item) => item.statementId === statement.id)
    .map((item) => summarizeStatementItem(item, statement, store));
  const adjustments = (store.statementAdjustments ?? []).filter((adjustment) => adjustment.statementId === statement.id);
  const styleReceivableTotal = sumMoney(items.map((item) => item.receivableAmount));
  const increaseAdjustmentTotal = sumMoney(
    adjustments.filter((adjustment) => adjustment.direction === "increase").map((adjustment) => adjustment.amount),
  );
  const decreaseAdjustmentTotal = sumMoney(
    adjustments.filter((adjustment) => adjustment.direction === "decrease").map((adjustment) => adjustment.amount),
  );
  const adjustmentNetAmount = roundMoney(increaseAdjustmentTotal - decreaseAdjustmentTotal);
  const adjustedReceivable = roundMoney(styleReceivableTotal + adjustmentNetAmount);
  const currentReceivable = adjustedReceivable;
  const currentReceived = sumMoney(
    store.receiptAllocations
      .filter((allocation) => allocation.statementId === statement.id)
      .map((allocation) => allocation.allocatedAmount),
  );
  const currentInvoiced = sumMoney(
    (store.invoiceAllocations ?? [])
      .filter((allocation) => allocation.statementId === statement.id)
      .map((allocation) => allocation.allocatedAmount),
  );
  const closingBalance = roundMoney(realtimeOpeningBalance + currentReceivable - currentReceived);
  const grandTotal = roundMoney(realtimeOpeningBalance + currentReceivable);

  return {
    statement,
    openingBalance,
    realtimeOpeningBalance,
    openingBalanceDifference: roundMoney(realtimeOpeningBalance - openingBalance),
    styleReceivableTotal,
    increaseAdjustmentTotal,
    decreaseAdjustmentTotal,
    adjustmentNetAmount,
    adjustedReceivable,
    currentReceivable,
    currentReceived,
    currentInvoiced,
    closingBalance,
    grandTotal,
    status: closingBalance <= 0 ? "已结清" : statement.status,
    items,
    adjustments,
  };
}

export function getAdjustmentSignedAmount(adjustment: StatementAdjustment) {
  return adjustment.direction === "decrease" ? -roundMoney(adjustment.amount) : roundMoney(adjustment.amount);
}

export function summarizeStatementItem(
  item: StatementItem,
  statement: MonthlyStatement,
  store: ReconciliationStore,
): StatementItemSummary {
  const styleAccount = store.styleAccounts.find((account) => account.id === item.styleAccountId);
  const invoicedAmount = sumMoney(
    (store.invoiceAllocations ?? [])
      .filter((allocation) => allocation.statementId === statement.id && allocation.styleAccountId === item.styleAccountId)
      .map((allocation) => allocation.allocatedAmount),
  );
  const paidAmount = sumMoney(
    store.receiptAllocations
      .filter((allocation) => allocation.statementId === statement.id && allocation.styleAccountId === item.styleAccountId)
      .map((allocation) => allocation.allocatedAmount),
  );
  const relatedAdjustments = (store.statementAdjustments ?? []).filter(
    (adjustment) => adjustment.statementId === statement.id && adjustment.relatedStyleAccountId === item.styleAccountId,
  );
  const adjustmentNetAmount = sumMoney(relatedAdjustments.map((adjustment) => getAdjustmentSignedAmount(adjustment)));
  const adjustedReceivableAmount = roundMoney(item.receivableAmount + adjustmentNetAmount);
  const unpaidAmount = roundMoney(Math.max(adjustedReceivableAmount - paidAmount, 0));
  const invoiceStatus = getInvoiceStatus(item.receivableAmount, invoicedAmount);
  const paymentStatus = getPaymentStatus(adjustedReceivableAmount, paidAmount);

  return {
    item,
    styleAccount,
    receivableAmount: roundMoney(item.receivableAmount),
    invoicedAmount,
    paidAmount,
    adjustmentNetAmount,
    adjustedReceivableAmount,
    unpaidAmount,
    statusLabels: buildStatusLabels(invoiceStatus, paymentStatus),
  };
}

export function summarizeCustomer(customer: Customer, store: ReconciliationStore): CustomerSummary {
  const statements = store.monthlyStatements.filter((statement) => statement.customerId === customer.id);
  const statementSummaries = statements.map((statement) => summarizeStatement(statement, store));
  const styleIds = new Set(
    store.statementItems.filter((item) => item.customerId === customer.id).map((item) => item.styleAccountId),
  );
  const receivableTotal = sumMoney(statementSummaries.map((summary) => summary.currentReceivable));
  const invoicedTotal = sumMoney(statementSummaries.map((summary) => summary.currentInvoiced));
  const paidTotal = sumMoney(statementSummaries.map((summary) => summary.currentReceived));
  const closingBalanceTotal = sumMoney(statementSummaries.map((summary) => summary.closingBalance));
  const paymentStatus = getPaymentStatus(receivableTotal, paidTotal);

  return {
    customerId: customer.id,
    customerName: getCustomerDisplayName(customer.id, store),
    statementCount: statements.length,
    styleCount: styleIds.size,
    receivableTotal,
    invoicedTotal,
    paidTotal,
    unpaidAmount: closingBalanceTotal,
    closingBalanceTotal,
    statusLabels: buildStatusLabels(getInvoiceStatus(receivableTotal, invoicedTotal), paymentStatus),
  };
}

export function summarizeAll(customers: Customer[], store: ReconciliationStore) {
  const customerSummaries = customers.map((customer) => summarizeCustomer(customer, store));

  return {
    receivableTotal: sumMoney(customerSummaries.map((summary) => summary.receivableTotal)),
    invoicedTotal: sumMoney(customerSummaries.map((summary) => summary.invoicedTotal)),
    paidTotal: sumMoney(customerSummaries.map((summary) => summary.paidTotal)),
    unpaidAmount: sumMoney(customerSummaries.map((summary) => summary.closingBalanceTotal)),
  };
}

export function getAvailablePeriods(store: ReconciliationStore) {
  return Array.from(new Set(store.monthlyStatements.map((statement) => statement.periodMonth))).sort().reverse();
}

export function getCustomerStartupOpeningBalance(customerId: string, store: ReconciliationStore) {
  const profile = getCustomerProfile(customerId, store);
  return roundMoney(typeof profile?.startupOpeningBalance === "number" ? profile.startupOpeningBalance : 0);
}

export function getDefaultOpeningBalance(customerId: string, periodMonth: string, store: ReconciliationStore) {
  const previousStatements = store.monthlyStatements
    .filter((statement) => statement.customerId === customerId && statement.periodMonth < periodMonth)
    .sort((left, right) => right.periodMonth.localeCompare(left.periodMonth));
  const previousStatement = previousStatements[0];
  return previousStatement ? summarizeStatement(previousStatement, store).closingBalance : getCustomerStartupOpeningBalance(customerId, store);
}

export function getRealtimeOpeningBalance(statement: MonthlyStatement, store: ReconciliationStore) {
  const previousStatements = store.monthlyStatements
    .filter((item) => item.customerId === statement.customerId && item.periodMonth < statement.periodMonth)
    .sort((left, right) => right.periodMonth.localeCompare(left.periodMonth));
  const previousStatement = previousStatements[0];
  return previousStatement ? summarizeStatement(previousStatement, store).closingBalance : getCustomerStartupOpeningBalance(statement.customerId, store);
}

export function getReceiptAllocatedAmount(receiptId: string, allocations: ReceiptAllocation[]) {
  return sumMoney(allocations.filter((allocation) => allocation.receiptId === receiptId).map((allocation) => allocation.allocatedAmount));
}

export function getInvoiceAllocatedAmount(invoiceId: string, allocations: import("../models").InvoiceAllocation[]) {
  return sumMoney(allocations.filter((allocation) => allocation.invoiceId === invoiceId).map((allocation) => allocation.allocatedAmount));
}

export function accountMatchesStatus(itemSummary: StatementItemSummary, status: AccountStatus | "") {
  if (!status) return true;
  return itemSummary.statusLabels.includes(status);
}

function getInvoiceStatus(receivableTotal: number, invoicedTotal: number): InvoiceStatus {
  if (receivableTotal <= 0 || invoicedTotal <= 0) return "未开票";
  if (invoicedTotal < receivableTotal) return "部分开票";
  return "已开票";
}

// ---------- V1.1 月度对账生命周期 ----------

export function getStatementLifecycle(statement: MonthlyStatement): import("../models").StatementLifecycle {
  if (statement.lifecycle) return statement.lifecycle;
  // 旧数据兼容：草稿→draft，已确认/已结清→confirmed
  if (statement.status === "已确认" || statement.status === "已结清") return "confirmed";
  return "draft";
}

export function getStatementVersion(statement: MonthlyStatement) {
  return typeof statement.version === "number" && statement.version >= 1 ? statement.version : 1;
}

export function getTodayDateString() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function getMonthEndDate(periodMonth: string) {
  const [year, month] = periodMonth.split("-").map(Number);
  if (!year || !month) return `${periodMonth}-28`;
  const monthEndDate = new Date(Date.UTC(year, month, 0));
  return monthEndDate.toISOString().slice(0, 10);
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function suggestDueDate(periodMonth: string, paymentTermDays?: number) {
  const days = typeof paymentTermDays === "number" && paymentTermDays > 0 ? Math.round(paymentTermDays) : 0;
  if (!days) return "";
  return addDays(getMonthEndDate(periodMonth), days);
}

export function getEffectiveDueDate(statement: MonthlyStatement, store: ReconciliationStore) {
  if (statement.dueDate) return statement.dueDate;
  const profile = getCustomerProfile(statement.customerId, store);
  return suggestDueDate(statement.periodMonth, profile?.paymentTermDays);
}

export type StatementDueInfo = {
  dueDate: string;
  remainingReceivable: number;
  dueStatus: import("../models").DueStatus;
  dueStatusLabel: string;
  overdueDays: number;
  agingBucket: import("../models").AgingBucket;
  agingLabel: string;
};

export function getStatementDueInfo(statement: MonthlyStatement, store: ReconciliationStore): StatementDueInfo {
  const dueDate = getEffectiveDueDate(statement, store);
  const remainingReceivable = roundMoney(Math.max(statement.closingBalance, 0));
  const today = getTodayDateString();
  let dueStatus: import("../models").DueStatus = "not_due";
  let overdueDays = 0;

  if (remainingReceivable <= 0) {
    dueStatus = "settled";
  } else if (dueDate && today > dueDate) {
    dueStatus = "overdue";
    overdueDays = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000);
  } else if (dueDate && today >= addDays(dueDate, -7)) {
    dueStatus = "due_soon";
  }

  const agingBucket = getAgingBucket(dueStatus === "settled" ? 0 : dueStatus === "overdue" ? overdueDays : 0, dueStatus);
  return {
    dueDate,
    remainingReceivable,
    dueStatus,
    dueStatusLabel: DUE_STATUS_LABELS[dueStatus],
    overdueDays,
    agingBucket,
    agingLabel: AGING_BUCKET_LABELS[agingBucket],
  };
}

function getAgingBucket(overdueDays: number, dueStatus: import("../models").DueStatus): import("../models").AgingBucket {
  if (dueStatus === "settled") return "not_due";
  if (dueStatus !== "overdue" || overdueDays <= 0) return "not_due";
  if (overdueDays <= 30) return "days_1_30";
  if (overdueDays <= 60) return "days_31_60";
  if (overdueDays <= 90) return "days_61_90";
  if (overdueDays <= 180) return "days_91_180";
  return "days_180_plus";
}

const DUE_STATUS_LABELS: Record<import("../models").DueStatus, string> = {
  settled: "已结清",
  not_due: "未到期",
  due_soon: "即将到期",
  overdue: "已逾期",
};

const AGING_BUCKET_LABELS: Record<import("../models").AgingBucket, string> = {
  not_due: "未到期",
  days_1_30: "1-30天",
  days_31_60: "31-60天",
  days_61_90: "61-90天",
  days_91_180: "91-180天",
  days_180_plus: "180天以上",
};

export function getAgingBucketsSummary(
  statementSummaries: Array<ReturnType<typeof summarizeStatement>>,
  store: ReconciliationStore,
) {
  const summary: Record<import("../models").AgingBucket, number> = {
    not_due: 0,
    days_1_30: 0,
    days_31_60: 0,
    days_61_90: 0,
    days_91_180: 0,
    days_180_plus: 0,
  };
  statementSummaries.forEach((statementSummary) => {
    const dueInfo = getStatementDueInfo(statementSummary.statement, store);
    summary[dueInfo.agingBucket] = roundMoney(summary[dueInfo.agingBucket] + dueInfo.remainingReceivable);
  });
  return summary;
}

// ---------- V1.1 收款核销 ----------

export type ReceiptSettlementInfo = {
  allocatedAmount: number;
  unallocatedAmount: number;
  status: import("../models").ReceiptSettlementStatus;
  statusLabel: string;
};

export function getReceiptSettlementInfo(receipt: CustomerReceipt, allocations: ReceiptAllocation[]): ReceiptSettlementInfo {
  const allocatedAmount = getReceiptAllocatedAmount(receipt.id, allocations);
  const unallocatedAmount = roundMoney(receipt.amount - allocatedAmount);
  const status: import("../models").ReceiptSettlementStatus =
    allocatedAmount <= 0 ? "unallocated" : unallocatedAmount > 0 ? "partial" : "allocated";
  const statusLabel =
    status === "unallocated" ? "未核销" : status === "partial" ? "部分核销" : "已核销";
  return { allocatedAmount, unallocatedAmount, status, statusLabel };
}

function getPaymentStatus(receivableTotal: number, paidTotal: number): PaymentStatus {
  if (receivableTotal <= 0 || paidTotal <= 0) return "未收款";
  if (paidTotal < receivableTotal) return "部分收款";
  return "已结清";
}

function buildStatusLabels(invoiceStatus: InvoiceStatus, paymentStatus: PaymentStatus) {
  const labels: AccountStatus[] = [invoiceStatus];
  if (paymentStatus !== "未收款" || invoiceStatus === "已开票") {
    labels.push(paymentStatus);
  }
  return labels;
}
