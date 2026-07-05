import type {
  AccountStatus,
  Customer,
  CustomerProfile,
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
  const currentInvoiced = sumMoney(items.map((item) => item.invoicedAmount));
  const closingBalance = roundMoney(openingBalance + currentReceivable - currentReceived);
  const grandTotal = roundMoney(openingBalance + currentReceivable);

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
  const invoicedAmount = styleAccount
    ? sumMoney(
        styleAccount.invoiceRecords
          .filter((record) => getPeriodFromDate(record.date) === statement.periodMonth)
          .map((record) => record.amount),
      )
    : 0;
  const paidAmount = sumMoney(
    store.receiptAllocations
      .filter((allocation) => allocation.statementId === statement.id && allocation.styleAccountId === item.styleAccountId)
      .map((allocation) => allocation.allocatedAmount),
  );
  const unpaidAmount = roundMoney(Math.max(item.receivableAmount - paidAmount, 0));
  const invoiceStatus = getInvoiceStatus(item.receivableAmount, invoicedAmount);
  const paymentStatus = getPaymentStatus(item.receivableAmount, paidAmount);

  return {
    item,
    styleAccount,
    receivableAmount: roundMoney(item.receivableAmount),
    invoicedAmount,
    paidAmount,
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

export function getDefaultOpeningBalance(customerId: string, periodMonth: string, store: ReconciliationStore) {
  const previousStatements = store.monthlyStatements
    .filter((statement) => statement.customerId === customerId && statement.periodMonth < periodMonth)
    .sort((left, right) => right.periodMonth.localeCompare(left.periodMonth));
  const previousStatement = previousStatements[0];
  return previousStatement ? summarizeStatement(previousStatement, store).closingBalance : 0;
}

export function getRealtimeOpeningBalance(statement: MonthlyStatement, store: ReconciliationStore) {
  const previousStatements = store.monthlyStatements
    .filter((item) => item.customerId === statement.customerId && item.periodMonth < statement.periodMonth)
    .sort((left, right) => right.periodMonth.localeCompare(left.periodMonth));
  const previousStatement = previousStatements[0];
  return previousStatement ? summarizeStatement(previousStatement, store).closingBalance : roundMoney(statement.openingBalance);
}

export function getReceiptAllocatedAmount(receiptId: string, allocations: ReceiptAllocation[]) {
  return sumMoney(allocations.filter((allocation) => allocation.receiptId === receiptId).map((allocation) => allocation.allocatedAmount));
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
