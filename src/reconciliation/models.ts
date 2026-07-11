export type InvoiceStatus = "未开票" | "部分开票" | "已开票";

export type PaymentStatus = "未收款" | "部分收款" | "已结清";

export type AccountStatus = InvoiceStatus | PaymentStatus;

export type StatementStatus = "草稿" | "已确认" | "已结清";

export type PaymentMethod = "银行转账" | "承兑汇票" | "现金" | "支付宝" | "微信" | "其他";

export type CustomerType = "品牌客户" | "贸易客户" | "服装厂" | "其他";

export type CustomerProfileStatus = "正常" | "暂停合作";

export type AdjustmentType = "质量扣款" | "短码扣款" | "色差扣款" | "运费扣款" | "折让" | "返利" | "补收" | "其他";

export type AdjustmentDirection = "decrease" | "increase";

export type Customer = {
  id: string;
  name: string;
  contact?: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomerProfile = {
  id: string;
  shortName: string;
  fullName: string;
  customerType: CustomerType;
  status: CustomerProfileStatus;
  contactName: string;
  mobile: string;
  phone: string;
  wechat: string;
  email: string;
  invoiceTitle: string;
  taxNumber: string;
  invoiceAddress: string;
  invoicePhone: string;
  bankName: string;
  bankAccount: string;
  defaultPaymentTerm: string;
  statementDay: string;
  paymentDay: string;
  currency: string;
  needInvoiceBeforePayment: boolean;
  shippingAddress: string;
  invoiceMailingAddress: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type ReceivableRecord = {
  id: string;
  date: string;
  amount: number;
  remark?: string;
};

export type InvoiceRecord = {
  id: string;
  date: string;
  invoiceNo: string;
  amount: number;
  remark?: string;
};

export type PaymentRecord = {
  id: string;
  date: string;
  method: PaymentMethod;
  amount: number;
  remark?: string;
};

export type StyleAccount = {
  id: string;
  customerId: string;
  styleNo: string;
  remark?: string;
  receivableRecords: ReceivableRecord[];
  invoiceRecords: InvoiceRecord[];
  paymentRecords: PaymentRecord[];
  createdAt: string;
  updatedAt: string;
};

export type MonthlyStatement = {
  id: string;
  customerId: string;
  periodMonth: string;
  openingBalance: number;
  currentReceivable: number;
  currentReceived: number;
  currentInvoiced: number;
  closingBalance: number;
  status: StatementStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type StatementItem = {
  id: string;
  statementId: string;
  customerId: string;
  styleAccountId: string;
  receivableAmount: number;
  note?: string;
};

export type CustomerReceipt = {
  id: string;
  customerId: string;
  receiptDate: string;
  amount: number;
  method: PaymentMethod;
  transactionNo?: string;
  periodMonth?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReceiptAllocation = {
  id: string;
  receiptId: string;
  customerId: string;
  statementId: string;
  styleAccountId?: string;
  allocatedAmount: number;
  note?: string;
};

export type StatementAdjustment = {
  id: string;
  customerId: string;
  statementId: string;
  periodMonth: string;
  adjustmentDate: string;
  adjustmentType: AdjustmentType;
  direction: AdjustmentDirection;
  amount: number;
  relatedStyleAccountId?: string;
  reason: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReconciliationStore = {
  customers: Customer[];
  customerProfiles: CustomerProfile[];
  styleAccounts: StyleAccount[];
  monthlyStatements: MonthlyStatement[];
  statementItems: StatementItem[];
  statementAdjustments: StatementAdjustment[];
  customerReceipts: CustomerReceipt[];
  receiptAllocations: ReceiptAllocation[];
};

export type StyleAccountSummary = {
  receivableTotal: number;
  invoicedTotal: number;
  uninvoicedAmount: number;
  paidTotal: number;
  unpaidAmount: number;
  invoiceStatus: InvoiceStatus;
  paymentStatus: PaymentStatus;
  statusLabels: AccountStatus[];
};

export type StatementItemSummary = {
  item: StatementItem;
  styleAccount?: StyleAccount;
  receivableAmount: number;
  invoicedAmount: number;
  paidAmount: number;
  adjustmentNetAmount: number;
  adjustedReceivableAmount: number;
  unpaidAmount: number;
  statusLabels: AccountStatus[];
};

export type MonthlyStatementSummary = {
  statement: MonthlyStatement;
  openingBalance: number;
  realtimeOpeningBalance: number;
  openingBalanceDifference: number;
  styleReceivableTotal: number;
  increaseAdjustmentTotal: number;
  decreaseAdjustmentTotal: number;
  adjustmentNetAmount: number;
  adjustedReceivable: number;
  currentReceivable: number;
  currentReceived: number;
  currentInvoiced: number;
  closingBalance: number;
  grandTotal: number;
  status: StatementStatus;
  items: StatementItemSummary[];
  adjustments: StatementAdjustment[];
};

export type CustomerSummary = {
  customerId: string;
  customerName: string;
  statementCount: number;
  styleCount: number;
  receivableTotal: number;
  invoicedTotal: number;
  paidTotal: number;
  unpaidAmount: number;
  closingBalanceTotal: number;
  statusLabels: AccountStatus[];
};

export const accountStatusOptions: AccountStatus[] = [
  "未开票",
  "部分开票",
  "已开票",
  "未收款",
  "部分收款",
  "已结清",
];

export const statementStatusOptions: StatementStatus[] = ["草稿", "已确认", "已结清"];

export const paymentMethods: PaymentMethod[] = ["银行转账", "承兑汇票", "现金", "支付宝", "微信", "其他"];

export const customerTypeOptions: CustomerType[] = ["品牌客户", "贸易客户", "服装厂", "其他"];

export const customerProfileStatusOptions: CustomerProfileStatus[] = ["正常", "暂停合作"];

export const adjustmentTypeOptions: AdjustmentType[] = ["质量扣款", "短码扣款", "色差扣款", "运费扣款", "折让", "返利", "补收", "其他"];

export const adjustmentDirectionOptions: Array<{ label: string; value: AdjustmentDirection }> = [
  { label: "调减", value: "decrease" },
  { label: "调增", value: "increase" },
];
