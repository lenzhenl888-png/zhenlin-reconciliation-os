export type InvoiceStatus = "未开票" | "部分开票" | "已开票";

export type PaymentStatus = "未收款" | "部分收款" | "已结清";

export type AccountStatus = InvoiceStatus | PaymentStatus;

export type StatementStatus = "草稿" | "已确认" | "已结清";

// V1.1 月度对账生命周期：草稿 → 已发送 → 客户已确认 → 已锁账。
// 旧数据没有 lifecycle 字段时按 status 兼容映射（草稿→draft，已确认/已结清→confirmed）。
export type StatementLifecycle = "draft" | "sent" | "confirmed" | "locked";

export type ConfirmationMethod = "微信确认" | "邮件确认" | "盖章对账单" | "电话确认" | "客户系统确认" | "其他";

export type SettlementType = "月结" | "款到发货" | "现结" | "自定义";

export type DueStatus = "settled" | "not_due" | "due_soon" | "overdue";

export type AgingBucket = "not_due" | "days_1_30" | "days_31_60" | "days_61_90" | "days_91_180" | "days_180_plus";

export type ReceiptSettlementStatus = "unallocated" | "partial" | "allocated";

export type StatementHistoryAction = "send" | "withdraw" | "confirm" | "unconfirm" | "lock";

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
  startupPeriodMonth?: string;
  startupOpeningBalance?: number;
  statementDay: string;
  paymentDay: string;
  currency: string;
  needInvoiceBeforePayment: boolean;
  settlementType?: SettlementType;
  paymentTermDays?: number;
  creditLimit?: number;
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
  lifecycle?: StatementLifecycle;
  dueDate?: string;
  sentAt?: string;
  sentBy?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  confirmationMethod?: ConfirmationMethod;
  confirmationNote?: string;
  confirmationAttachmentIds?: string[];
  lockedAt?: string;
  lockedBy?: string;
  version?: number;
  lastModifiedAt?: string;
  lastModifiedBy?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type StatementConfirmationHistory = {
  id: string;
  statementId: string;
  version: number;
  action: StatementHistoryAction;
  statusBefore: StatementLifecycle;
  statusAfter: StatementLifecycle;
  confirmedAmount: number;
  operatorId: string;
  operatorName: string;
  occurredAt: string;
  method?: ConfirmationMethod;
  note?: string;
};

export type AuditLog = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  module: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
  description: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
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
  isLocked?: boolean;
  transactionNo?: string;
  periodMonth?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomerInvoice = {
  id: string;
  customerId: string;
  invoiceDate: string;
  invoiceNo: string;
  amount: number;
  isLocked?: boolean;
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
  allocationDate?: string;
  createdBy?: string;
  createdAt?: string;
  note?: string;
};

export type InvoiceAllocation = {
  id: string;
  invoiceId: string;
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
  customerInvoices: CustomerInvoice[];
  invoiceAllocations: InvoiceAllocation[];
  statementConfirmationHistories?: StatementConfirmationHistory[];
  auditLogs?: AuditLog[];
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

export const statementLifecycleOptions: StatementLifecycle[] = ["draft", "sent", "confirmed", "locked"];

export const statementLifecycleLabels: Record<StatementLifecycle, string> = {
  draft: "草稿",
  sent: "已发送",
  confirmed: "客户已确认",
  locked: "已锁账",
};

export const confirmationMethodOptions: ConfirmationMethod[] = [
  "微信确认",
  "邮件确认",
  "盖章对账单",
  "电话确认",
  "客户系统确认",
  "其他",
];

export const settlementTypeOptions: SettlementType[] = ["月结", "款到发货", "现结", "自定义"];

export const dueStatusLabels: Record<DueStatus, string> = {
  settled: "已结清",
  not_due: "未到期",
  due_soon: "即将到期",
  overdue: "已逾期",
};

export const agingBucketLabels: Record<AgingBucket, string> = {
  not_due: "未到期",
  days_1_30: "1-30天",
  days_31_60: "31-60天",
  days_61_90: "61-90天",
  days_91_180: "91-180天",
  days_180_plus: "180天以上",
};

export const agingBuckets: AgingBucket[] = ["not_due", "days_1_30", "days_31_60", "days_61_90", "days_91_180", "days_180_plus"];

export const receiptSettlementStatusLabels: Record<ReceiptSettlementStatus, string> = {
  unallocated: "未核销",
  partial: "部分核销",
  allocated: "已核销",
};

export const statementHistoryActionLabels: Record<StatementHistoryAction, string> = {
  send: "标记已发送",
  withdraw: "撤回至草稿",
  confirm: "客户确认",
  unconfirm: "反确认",
  lock: "锁账",
};

// 权限点预留：第一版不接入 RBAC，仅统一命名便于后续按角色控制。
export const permissionKeys = {
  statementConfirm: "statement.confirm",
  statementUnconfirm: "statement.unconfirm",
  statementLock: "statement.lock",
  receiptAllocate: "receipt.allocate",
  receiptUnallocate: "receipt.unallocate",
  auditView: "audit.view",
} as const;

export const auditModuleLabels: Record<string, string> = {
  customer: "客户资料",
  statement: "月度对账",
  receivable: "款号应收",
  adjustment: "对账调整",
  invoice: "开票",
  receipt: "收款",
  allocation: "收款核销",
  auth: "账号",
  system: "系统",
};

export const auditActionLabels: Record<string, string> = {
  create: "新增",
  update: "修改",
  delete: "删除",
  confirm: "客户确认",
  unconfirm: "反确认",
  lock: "锁账",
  send: "标记已发送",
  allocate: "核销",
  unallocate: "撤销核销",
  change_status: "状态变更",
  login: "登录",
  logout: "登出",
};

export const paymentMethods: PaymentMethod[] = ["银行转账", "承兑汇票", "现金", "支付宝", "微信", "其他"];

export const customerTypeOptions: CustomerType[] = ["品牌客户", "贸易客户", "服装厂", "其他"];

export const customerProfileStatusOptions: CustomerProfileStatus[] = ["正常", "暂停合作"];

export const adjustmentTypeOptions: AdjustmentType[] = ["质量扣款", "短码扣款", "色差扣款", "运费扣款", "折让", "返利", "补收", "其他"];

export const adjustmentDirectionOptions: Array<{ label: string; value: AdjustmentDirection }> = [
  { label: "调减", value: "decrease" },
  { label: "调增", value: "increase" },
];
