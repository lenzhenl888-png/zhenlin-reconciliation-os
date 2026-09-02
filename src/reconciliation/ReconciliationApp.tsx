import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  FileCog,
  FileDown,
  FileText,
  Filter,
  Landmark,
  LayoutDashboard,
  Lock,
  LockOpen,
  Menu,
  Network,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { createId } from "../utils/id";
import { useAuth } from "../auth/AuthContext";
import { AnimatedSelect } from "../components/common/AnimatedSelect";
import { SearchableSelect } from "../components/common/SearchableSelect";
import { ClickSpark } from "../components/common/ClickSpark";
import { Particles } from "../components/common/Particles";
import type {
  AccountStatus,
  AdjustmentDirection,
  AuditLog,
  Customer,
  CustomerInvoice,
  CustomerProfile,
  CustomerProfileStatus,
  CustomerReceipt,
  CustomerType,
  InvoiceRecord,
  InvoiceAllocation,
  MonthlyStatement,
  PaymentMethod,
  ReceiptAllocation,
  ReconciliationStore,
  StatementAdjustment,
  StatementConfirmationHistory,
  StatementHistoryAction,
  StatementItem,
  StatementLifecycle,
  StatementStatus,
  StyleAccount,
  SettlementType,
} from "./models";
import {
  accountStatusOptions,
  adjustmentDirectionOptions,
  agingBucketLabels,
  agingBuckets,
  auditActionLabels,
  auditModuleLabels,
  confirmationMethodOptions,
  customerProfileStatusOptions,
  customerTypeOptions,
  paymentMethods,
  settlementTypeOptions,
  statementHistoryActionLabels,
  statementLifecycleLabels,
  statementStatusOptions,
} from "./models";
import { reconciliationRepository } from "./repositories/reconciliationRepository";
import {
  readCustomerProfileImportFile,
  type CustomerProfileImportRow,
} from "./utils/customerProfileImport";
import { readReceiptImportFile, type ReceiptImportRow } from "./utils/receiptImport";
import { readInvoiceImportFile, type InvoiceImportRow } from "./utils/invoiceImport";
import {
  accountMatchesStatus,
  formatMoney,
  getAgingBucketsSummary,
  getAvailablePeriods,
  getCurrentPeriod,
  getCustomerDisplayName,
  getCustomerProfile,
  getDefaultOpeningBalance,
  getAdjustmentSignedAmount,
  getInvoiceAllocatedAmount,
  getReceiptAllocatedAmount,
  getReceiptSettlementInfo,
  getStatementDueInfo,
  getStatementLifecycle,
  getStatementVersion,
  parseMoney,
  roundMoney,
  suggestDueDate,
  sumMoney,
  summarizeAll,
  summarizeCustomer,
  summarizeStatement,
} from "./services/accounting";
import "./styles.css";

type ActiveModule = "customer" | "customerProfiles" | "supplier" | "overview" | "finance" | "settings";
type DetailTab = "receivable" | "adjustment" | "invoice" | "payment";

type ModalState =
  | { type: "customer"; customer?: Customer }
  | { type: "statement"; customerId?: string }
  | { type: "statementItem"; item?: StatementItem; customerId: string; statementId: string }
  | { type: "receiptPool"; customerId: string }
  | { type: "invoicePool"; customerId: string }
  | { type: "allocation"; customerId: string; receiptId?: string; returnToPool?: boolean; statementId?: string }
  | { type: "invoiceAllocation"; customerId: string; invoiceId?: string; returnToPool?: boolean; statementId?: string }
  | { type: "statementPreview" }
  | { type: "statementConfirm"; statementId: string }
  | { type: "statementUnconfirm"; statementId: string }
  | { type: "statementHistory"; statementId: string }
  | { type: "settlement"; customerId: string; receiptId: string; returnToPool?: boolean }
  | null;

type Filters = {
  customerName: string;
  styleNo: string;
  status: AccountStatus | "";
};

type CloudStatus = "loading" | "ready" | "saving" | "error";

const navItems: Array<{ id: ActiveModule; label: string; icon: typeof Users }> = [
  { id: "customer", label: "客户对账", icon: Users },
  { id: "overview", label: "对账总览", icon: LayoutDashboard },
  { id: "finance", label: "财务明细", icon: ReceiptText },
  { id: "customerProfiles", label: "客户资料", icon: UserPlus },
  { id: "settings", label: "系统设置", icon: Settings },
];

const emptyFilters: Filters = {
  customerName: "",
  styleNo: "",
  status: "",
};

function toSelectOptions<TValue extends string>(options: readonly TValue[]) {
  return options.map((option) => ({ label: option, value: option }));
}

// ---------- V1.1 审计日志：基于 store 前后差异自动生成操作记录 ----------

type AuditEntityRuntime = Record<string, unknown> & { id: string };

type AuditCollectionConfig = {
  collection: keyof ReconciliationStore;
  module: string;
  entityType: string;
  keyFields: string[];
};

const auditFieldLabels: Record<string, string> = {
  name: "名称",
  shortName: "客户简称",
  contact: "联系方式",
  contactName: "联系人",
  remark: "备注",
  status: "状态",
  lifecycle: "对账状态",
  openingBalance: "期初余额",
  dueDate: "到期日",
  note: "备注",
  styleNo: "款号",
  receivableAmount: "应收金额",
  adjustmentType: "调整类型",
  direction: "调整方向",
  amount: "金额",
  reason: "原因",
  receiptDate: "收款日期",
  method: "收款方式",
  transactionNo: "流水号",
  invoiceDate: "开票日期",
  invoiceNo: "发票号码",
  allocatedAmount: "核销金额",
  statementId: "所属月度对账单",
  styleAccountId: "关联款号",
  isLocked: "锁定状态",
  settlementType: "结算方式",
  paymentTermDays: "账期天数",
  creditLimit: "信用额度",
  needInvoiceBeforePayment: "付款前必须开票",
  startupOpeningBalance: "期初启动余额",
  customerId: "所属客户",
};

const auditMoneyFields = new Set(["amount", "receivableAmount", "openingBalance", "allocatedAmount", "creditLimit", "startupOpeningBalance"]);

function auditFormatValue(collection: keyof ReconciliationStore, field: string, value: unknown, store: ReconciliationStore) {
  if (value === undefined || value === null || value === "") return "（空）";
  if (field === "statementId") {
    const statement = store.monthlyStatements.find((item) => item.id === value);
    return statement ? `${statement.periodMonth} 月度单` : String(value);
  }
  if (field === "styleAccountId") {
    const style = store.styleAccounts.find((item) => item.id === value);
    return style?.styleNo ?? "整月调整";
  }
  if (field === "lifecycle") return statementLifecycleLabels[value as StatementLifecycle] ?? String(value);
  if (field === "direction") return value === "decrease" ? "调减" : "调增";
  if (auditMoneyFields.has(field)) return `¥ ${formatMoney(Number(value))}`;
  return String(value);
}

function auditDescribeEntity(collection: keyof ReconciliationStore, entity: AuditEntityRuntime, store: ReconciliationStore) {
  const customerName = (customerId: unknown) => getCustomerDisplayName(String(customerId ?? ""), store);
  switch (collection) {
    case "customers":
      return `客户「${String(entity.name ?? "")}」`;
    case "customerProfiles":
      return `客户资料「${String(entity.shortName ?? entity.fullName ?? "")}」`;
    case "styleAccounts":
      return `款号「${String(entity.styleNo ?? "")}」`;
    case "monthlyStatements":
      return `${customerName(entity.customerId)} ${String(entity.periodMonth ?? "")} 月度对账单`;
    case "statementItems": {
      const statement = store.monthlyStatements.find((item) => item.id === entity.statementId);
      const style = store.styleAccounts.find((item) => item.id === entity.styleAccountId);
      return `${customerName(entity.customerId)} ${statement?.periodMonth ?? ""} 款号「${style?.styleNo ?? "-"}」应收`;
    }
    case "statementAdjustments":
      return `${customerName(entity.customerId)} ${String(entity.periodMonth ?? "")} 扣款调整`;
    case "customerReceipts":
      return `${customerName(entity.customerId)} ${String(entity.receiptDate ?? "")} 收款 ¥ ${formatMoney(Number(entity.amount ?? 0))}`;
    case "customerInvoices":
      return `${customerName(entity.customerId)} ${String(entity.invoiceDate ?? "")} 开票`;
    case "receiptAllocations":
      return `收款核销记录（¥ ${formatMoney(Number(entity.allocatedAmount ?? 0))}）`;
    case "invoiceAllocations":
      return `开票分配记录（¥ ${formatMoney(Number(entity.allocatedAmount ?? 0))}）`;
    default:
      return String(entity.id ?? "");
  }
}

const auditCollectionConfigs: Array<AuditCollectionConfig> = [
  {
    collection: "customers",
    module: "customer",
    entityType: "customer",
    keyFields: ["name", "contact", "remark"],
  },
  {
    collection: "customerProfiles",
    module: "customer",
    entityType: "customerProfile",
    keyFields: ["shortName", "status", "contactName", "mobile", "settlementType", "paymentTermDays", "creditLimit", "needInvoiceBeforePayment", "startupOpeningBalance"],
  },
  {
    collection: "styleAccounts",
    module: "receivable",
    entityType: "styleAccount",
    keyFields: ["styleNo", "customerId"],
  },
  {
    collection: "monthlyStatements",
    module: "statement",
    entityType: "statement",
    keyFields: ["lifecycle", "status", "openingBalance", "dueDate", "note"],
  },
  {
    collection: "statementItems",
    module: "receivable",
    entityType: "statementItem",
    keyFields: ["receivableAmount", "note", "statementId", "styleAccountId"],
  },
  {
    collection: "statementAdjustments",
    module: "adjustment",
    entityType: "statementAdjustment",
    keyFields: ["adjustmentType", "direction", "amount", "reason", "note"],
  },
  {
    collection: "customerReceipts",
    module: "receipt",
    entityType: "customerReceipt",
    keyFields: ["amount", "receiptDate", "method", "transactionNo", "note", "isLocked"],
  },
  {
    collection: "customerInvoices",
    module: "invoice",
    entityType: "customerInvoice",
    keyFields: ["amount", "invoiceDate", "invoiceNo", "note", "isLocked"],
  },
  {
    collection: "receiptAllocations",
    module: "allocation",
    entityType: "receiptAllocation",
    keyFields: ["allocatedAmount", "statementId", "styleAccountId", "note"],
  },
  {
    collection: "invoiceAllocations",
    module: "allocation",
    entityType: "invoiceAllocation",
    keyFields: ["allocatedAmount", "statementId", "styleAccountId", "note"],
  },
];

function auditPickFields(entity: AuditEntityRuntime, fields: string[]) {
  const picked: Record<string, unknown> = {};
  fields.forEach((field) => {
    picked[field] = entity[field] ?? null;
  });
  return picked;
}

function buildAuditLogEntries(
  currentStore: ReconciliationStore,
  nextStore: ReconciliationStore,
  operator: { userId: string; username: string; displayName: string },
): AuditLog[] {
  const entries: AuditLog[] = [];
  const occurredAt = new Date().toISOString();
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";

  function makeEntry(
    action: string,
    collection: keyof ReconciliationStore,
    config: AuditCollectionConfig,
    entity: AuditEntityRuntime,
    beforeData: Record<string, unknown>,
    afterData: Record<string, unknown>,
    storeForDescription: ReconciliationStore,
  ) {
    entries.push({
      id: createId("audit"),
      userId: operator.userId,
      username: operator.username,
      displayName: operator.displayName,
      module: config.module,
      entityType: config.entityType,
      entityId: String(entity.id ?? ""),
      action,
      beforeData,
      afterData,
      description: `${auditActionLabels[action] ?? action} · ${auditDescribeEntity(config.collection, entity, storeForDescription)}`,
      ipAddress: "",
      userAgent,
      createdAt: occurredAt,
    });
  }

  auditCollectionConfigs.forEach((config) => {
    const beforeList = (currentStore[config.collection] ?? []) as unknown as AuditEntityRuntime[];
    const afterList = (nextStore[config.collection] ?? []) as unknown as AuditEntityRuntime[];
    const beforeById = new Map(beforeList.map((entity) => [entity.id, entity]));
    const afterById = new Map(afterList.map((entity) => [entity.id, entity]));

    afterList.forEach((entity) => {
      const before = beforeById.get(entity.id);
      if (!before) {
        makeEntry("create", config.collection, config, entity, {}, auditPickFields(entity, config.keyFields), nextStore);
        return;
      }
      const changedFields = config.keyFields.filter((field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(entity[field] ?? null));
      if (changedFields.length === 0) return;

      let action = "update";
      if (config.collection === "monthlyStatements") {
        const transition = `${before.lifecycle ?? "draft"}|${entity.lifecycle ?? "draft"}`;
        const transitionActions: Record<string, string> = {
          "draft|sent": "send",
          "sent|confirmed": "confirm",
          "confirmed|draft": "unconfirm",
          "confirmed|locked": "lock",
        };
        if (transitionActions[transition]) action = transitionActions[transition];
      }

      const beforeData = auditPickFields(before as AuditEntityRuntime, changedFields);
      const afterData = auditPickFields(entity, changedFields);
      const description = `${auditActionLabels[action] ?? action} · ${auditDescribeEntity(config.collection, entity, nextStore)}：${changedFields
        .map((field) =>
          `${auditFieldLabels[field] ?? field} ${auditFormatValue(config.collection, field, beforeData[field], nextStore)} → ${auditFormatValue(config.collection, field, afterData[field], nextStore)}`,
        )
        .join("，")}`;
      entries.push({
        id: createId("audit"),
        userId: operator.userId,
        username: operator.username,
        displayName: operator.displayName,
        module: config.module,
        entityType: config.entityType,
        entityId: String(entity.id ?? ""),
        action,
        beforeData,
        afterData,
        description,
        ipAddress: "",
        userAgent,
        createdAt: occurredAt,
      });
    });

    beforeList.forEach((entity) => {
      if (!afterById.has(entity.id)) {
        makeEntry("delete", config.collection, config, entity, auditPickFields(entity, config.keyFields), {}, currentStore);
      }
    });
  });

  return entries;
}

export function ReconciliationApp() {
  const auth = useAuth();
  const [store, setStore] = useState(() => reconciliationRepository.load());
  const periods = useMemo(() => getAvailablePeriods(store), [store]);
  const [activeModule, setActiveModule] = useState<ActiveModule>("customer");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(store.customers[0]?.id ?? "");
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0] ?? getCurrentPeriod());
  const [selectedItemId, setSelectedItemId] = useState("");
  const [detailTab, setDetailTab] = useState<DetailTab>("receivable");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [draftFilters, setDraftFilters] = useState<Filters>(emptyFilters);
  const [modal, setModal] = useState<ModalState>(null);
  const [pendingAdjustmentDeleteId, setPendingAdjustmentDeleteId] = useState<string>();
  const [pendingInvoiceAllocationDeleteId, setPendingInvoiceAllocationDeleteId] = useState<string>();
  const [pendingStatementItemDeleteId, setPendingStatementItemDeleteId] = useState<string>();
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("loading");
  const [cloudNotice, setCloudNotice] = useState("正在同步云端数据...");
  const [showCloudNotice, setShowCloudNotice] = useState(true);
  const cloudReadyRef = useRef(false);
  const latestSaveIdRef = useRef(0);
  const isLocalDevelopment = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const currentUserLabel = isLocalDevelopment ? "admin" : auth.user?.displayName || auth.user?.username;

  useEffect(() => {
    reconciliationRepository.save(store);
    if (auth.status !== "authenticated" || !auth.token || !cloudReadyRef.current) return;
    const saveId = latestSaveIdRef.current + 1;
    latestSaveIdRef.current = saveId;
    setCloudStatus("saving");
    setCloudNotice("正在保存云端数据...");
    setShowCloudNotice(true);
    const timer = window.setTimeout(() => {
      void reconciliationRepository
        .saveCloud(auth.token, store)
        .then(() => {
          if (latestSaveIdRef.current !== saveId) return;
          setCloudStatus("ready");
          setCloudNotice("云端数据已保存");
          setShowCloudNotice(true);
          window.setTimeout(() => setShowCloudNotice(false), 1800);
        })
        .catch((error) => {
          if (latestSaveIdRef.current !== saveId) return;
          setCloudStatus("error");
          setCloudNotice(error instanceof Error ? error.message : "云端保存失败，本地数据已临时保留");
          setShowCloudNotice(true);
          if (error instanceof Error && error.name === "SESSION_REPLACED") void auth.checkSession();
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [auth.checkSession, auth.status, auth.token, store]);

  useEffect(() => {
    if (auth.status !== "authenticated" || !auth.token) return;
    let canceled = false;
    cloudReadyRef.current = false;
    setCloudStatus("loading");
    setCloudNotice("正在同步云端数据...");
    setShowCloudNotice(true);

    async function loadCloudStore() {
      try {
        const localStore = reconciliationRepository.load();
        const cloudStore = await reconciliationRepository.loadCloud(auth.token);
        const localHasData = false;
        const cloudHasData = reconciliationRepository.hasBusinessData(cloudStore);
        const localDiffersFromCloud = JSON.stringify(localStore) !== JSON.stringify(cloudStore);
        const migrationMessage = cloudHasData
          ? "发现本机还有未迁移的本地对账数据，是否合并上传到云端？同 id 数据会更新，不会重复添加。"
          : "发现本机有本地对账数据，是否上传到云端？确认后这份数据会成为云端业务数据。";
        const shouldMigrateLocal =
          localHasData && localDiffersFromCloud && window.confirm(migrationMessage);
        const nextStore = shouldMigrateLocal
          ? await reconciliationRepository.mergeLocalToCloud(auth.token, localStore)
          : cloudStore;
        if (canceled) return;
        setStore(nextStore);
        setSelectedCustomerId(nextStore.customers[0]?.id ?? "");
        setSelectedPeriod(getAvailablePeriods(nextStore)[0] ?? getCurrentPeriod());
        setSelectedItemId("");
        cloudReadyRef.current = true;
        setCloudStatus("ready");
        setCloudNotice(shouldMigrateLocal ? "本地数据已合并上传到云端" : "已连接云端数据");
        setShowCloudNotice(shouldMigrateLocal);
        if (shouldMigrateLocal) window.setTimeout(() => setShowCloudNotice(false), 2200);
      } catch (error) {
        if (canceled) return;
        cloudReadyRef.current = false;
        setCloudStatus("error");
        setCloudNotice(error instanceof Error ? error.message : "云端数据同步失败，当前仍在使用本地数据");
        setShowCloudNotice(true);
        if (error instanceof Error && error.name === "SESSION_REPLACED") void auth.checkSession();
      }
    }

    void loadCloudStore();
    return () => {
      canceled = true;
    };
  }, [auth.status, auth.token]);

  const customerProfiles = store.customerProfiles ?? [];
  const activeCustomerIds = new Set(customerProfiles.filter((profile) => profile.status === "正常").map((profile) => profile.id));
  const activeCustomers = store.customers.filter((customer) => activeCustomerIds.has(customer.id));
  const selectedCustomer = store.customers.find((customer) => customer.id === selectedCustomerId);
  const selectedCustomerName = selectedCustomer ? getCustomerDisplayName(selectedCustomer.id, store) : "未选择客户";
  const selectedStatement = store.monthlyStatements.find(
    (statement) => statement.customerId === selectedCustomerId && statement.periodMonth === selectedPeriod,
  );
  const selectedStatementSummary = selectedStatement ? summarizeStatement(selectedStatement, store) : null;

  const filteredItems = useMemo(() => {
    const styleNo = filters.styleNo.trim().toLowerCase();
    return (selectedStatementSummary?.items ?? []).filter((itemSummary) => {
      const matchesStyle = !styleNo || itemSummary.styleAccount?.styleNo.toLowerCase().includes(styleNo);
      return matchesStyle && accountMatchesStatus(itemSummary, filters.status);
    });
  }, [filters.status, filters.styleNo, selectedStatementSummary]);

  useEffect(() => {
    if (!filteredItems.length) {
      setSelectedItemId("");
      return;
    }
    if (!filteredItems.some((item) => item.item.id === selectedItemId)) {
      setSelectedItemId(filteredItems[0].item.id);
    }
  }, [filteredItems, selectedItemId]);

  const selectedItemSummary = selectedStatementSummary?.items.find((item) => item.item.id === selectedItemId);
  const selectedAccount = selectedItemSummary?.styleAccount;
  const customerSummaries = useMemo(() => {
    const customerName = filters.customerName.trim().toLowerCase();
    return store.customers
      .filter((customer) => {
        const profile = getCustomerProfile(customer.id, store);
        const displayText = `${profile?.shortName ?? customer.name} ${profile?.fullName ?? ""}`.toLowerCase();
        return !customerName || displayText.includes(customerName);
      })
      .map((customer) => summarizeCustomer(customer, store))
      .sort((left, right) => right.closingBalanceTotal - left.closingBalanceTotal || left.customerName.localeCompare(right.customerName, "zh-Hans-CN"));
  }, [filters.customerName, store]);
  const allSummary = summarizeAll(store.customers, store);

  function updateStore(updater: (currentStore: typeof store) => typeof store) {
    setStore((currentStore) => {
      const nextStore = updater(currentStore);
      const auditEntries = buildAuditLogEntries(currentStore, nextStore, {
        displayName: currentUserLabel ?? "未知用户",
        userId: auth.user?.id ?? "local-dev-user",
        username: auth.user?.username ?? "local-dev",
      });
      if (auditEntries.length === 0) return nextStore;
      return { ...nextStore, auditLogs: [...(nextStore.auditLogs ?? []), ...auditEntries] };
    });
  }

  function upsertCustomer(values: Pick<Customer, "name" | "contact" | "remark">, customerId?: string) {
    const today = getTodayString();
    if (customerId) {
      updateStore((currentStore) => ({
        ...currentStore,
        customers: currentStore.customers.map((customer) =>
          customer.id === customerId ? { ...customer, ...values, updatedAt: today } : customer,
        ),
      }));
      return;
    }

    const customer: Customer = {
      id: createId("cust"),
      ...values,
      createdAt: today,
      updatedAt: today,
    };
    updateStore((currentStore) => ({ ...currentStore, customers: [customer, ...currentStore.customers] }));
    setSelectedCustomerId(customer.id);
  }

  function upsertCustomerProfile(profile: CustomerProfile) {
    const today = getTodayString();
    const normalizedProfile = {
      ...profile,
      startupPeriodMonth: profile.startupPeriodMonth?.trim() ?? "",
      startupOpeningBalance: roundMoney(profile.startupOpeningBalance ?? 0),
      updatedAt: today,
    };
    const customer: Customer = {
      id: normalizedProfile.id,
      name: normalizedProfile.shortName || normalizedProfile.fullName,
      contact: normalizedProfile.contactName,
      remark: normalizedProfile.note,
      createdAt: normalizedProfile.createdAt || today,
      updatedAt: today,
    };

    updateStore((currentStore) => {
      const exists = currentStore.customerProfiles.some((item) => item.id === normalizedProfile.id);
      const customerExists = currentStore.customers.some((item) => item.id === normalizedProfile.id);
      const customerStatements = currentStore.monthlyStatements
        .filter((statement) => statement.customerId === normalizedProfile.id)
        .sort((left, right) => left.periodMonth.localeCompare(right.periodMonth));
      const firstStatement = customerStatements[0];
      const profileWithStartup = {
        ...normalizedProfile,
        startupPeriodMonth: firstStatement?.periodMonth ?? normalizedProfile.startupPeriodMonth,
      };
      return {
        ...currentStore,
        customerProfiles: exists
          ? currentStore.customerProfiles.map((item) => (item.id === normalizedProfile.id ? profileWithStartup : item))
          : [profileWithStartup, ...currentStore.customerProfiles],
        customers: customerExists
          ? currentStore.customers.map((item) => (item.id === customer.id ? { ...item, ...customer } : item))
          : [customer, ...currentStore.customers],
        monthlyStatements: firstStatement
          ? currentStore.monthlyStatements.map((statement) =>
              statement.id === firstStatement.id
                ? {
                    ...statement,
                    openingBalance: profileWithStartup.startupOpeningBalance ?? 0,
                    updatedAt: today,
                  }
                : statement,
            )
          : currentStore.monthlyStatements,
      };
    });
    setSelectedCustomerId(normalizedProfile.id);
  }

  function importCustomerProfiles(rows: CustomerProfileImportRow[], parseWarnings: string[]) {
    if (rows.length === 0) {
      window.alert(parseWarnings[0] ?? "没有可导入的客户资料。");
      return;
    }

    const today = getTodayString();
    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let selectedImportedId = "";
    const warnings = [...parseWarnings];

    updateStore((currentStore) => {
      const profiles = [...currentStore.customerProfiles];
      const customers = [...currentStore.customers];

      function normalizeKey(value?: string) {
        return (value ?? "").trim().toLowerCase();
      }

      function findUniqueProfileIndex(predicate: (profile: CustomerProfile) => boolean) {
        const matchedIndexes = profiles
          .map((profile, index) => ({ profile, index }))
          .filter(({ profile }) => predicate(profile))
          .map(({ index }) => index);
        return matchedIndexes.length === 1 ? matchedIndexes[0] : -1;
      }

      function findExistingIndex(fields: Partial<CustomerProfile>, sourceRow: number) {
        const id = normalizeKey(fields.id);
        if (id) {
          const index = profiles.findIndex((profile) => normalizeKey(profile.id) === id);
          if (index >= 0) return index;
        }

        const taxNumber = normalizeKey(fields.taxNumber);
        if (taxNumber) {
          const index = profiles.findIndex((profile) => normalizeKey(profile.taxNumber) === taxNumber);
          if (index >= 0) return index;
        }

        const shortName = normalizeKey(fields.shortName);
        const fullName = normalizeKey(fields.fullName);
        if (shortName && fullName) {
          const index = profiles.findIndex(
            (profile) => normalizeKey(profile.shortName) === shortName && normalizeKey(profile.fullName) === fullName,
          );
          if (index >= 0) return index;
        }

        if (shortName) {
          const index = findUniqueProfileIndex((profile) => normalizeKey(profile.shortName) === shortName);
          if (index >= 0) return index;
          if (profiles.some((profile) => normalizeKey(profile.shortName) === shortName)) {
            warnings.push(`第 ${sourceRow} 行客户简称存在多个匹配，已跳过以避免误更新。`);
            return -2;
          }
        }

        if (fullName) {
          const index = findUniqueProfileIndex((profile) => normalizeKey(profile.fullName) === fullName);
          if (index >= 0) return index;
          if (profiles.some((profile) => normalizeKey(profile.fullName) === fullName)) {
            warnings.push(`第 ${sourceRow} 行客户全称存在多个匹配，已跳过以避免误更新。`);
            return -2;
          }
        }

        return -1;
      }

      function withImportedFields(base: CustomerProfile, fields: Partial<CustomerProfile>) {
        const textField = (key: keyof CustomerProfile) => {
          const value = fields[key];
          return typeof value === "string" && value.trim() ? value.trim() : base[key];
        };

        return {
          ...base,
          shortName: textField("shortName") as string,
          fullName: textField("fullName") as string,
          customerType: fields.customerType ?? base.customerType,
          status: fields.status ?? base.status,
          contactName: textField("contactName") as string,
          mobile: textField("mobile") as string,
          phone: textField("phone") as string,
          wechat: textField("wechat") as string,
          email: textField("email") as string,
          invoiceTitle: textField("invoiceTitle") as string,
          taxNumber: textField("taxNumber") as string,
          invoiceAddress: textField("invoiceAddress") as string,
          invoicePhone: textField("invoicePhone") as string,
          bankName: textField("bankName") as string,
          bankAccount: textField("bankAccount") as string,
          defaultPaymentTerm: textField("defaultPaymentTerm") as string,
          startupPeriodMonth: textField("startupPeriodMonth") as string,
          startupOpeningBalance: fields.startupOpeningBalance ?? base.startupOpeningBalance ?? 0,
          statementDay: textField("statementDay") as string,
          paymentDay: textField("paymentDay") as string,
          currency: textField("currency") as string,
          needInvoiceBeforePayment: fields.needInvoiceBeforePayment ?? base.needInvoiceBeforePayment,
          shippingAddress: textField("shippingAddress") as string,
          invoiceMailingAddress: textField("invoiceMailingAddress") as string,
          note: textField("note") as string,
          updatedAt: today,
        };
      }

      function syncCustomer(profile: CustomerProfile) {
        const customer: Customer = {
          id: profile.id,
          name: profile.shortName || profile.fullName,
          contact: profile.contactName,
          remark: profile.note,
          createdAt: profile.createdAt || today,
          updatedAt: today,
        };
        const index = customers.findIndex((item) => item.id === customer.id);
        if (index >= 0) {
          customers[index] = { ...customers[index], ...customer };
        } else {
          customers.unshift(customer);
        }
      }

      rows.forEach(({ fields, sourceRow }) => {
        const matchIndex = findExistingIndex(fields, sourceRow);
        if (matchIndex === -2) {
          skippedCount += 1;
          return;
        }

        const existing = matchIndex >= 0 ? profiles[matchIndex] : undefined;
        if (!existing && (!fields.shortName?.trim() || !fields.fullName?.trim())) {
          skippedCount += 1;
          warnings.push(`第 ${sourceRow} 行为新客户，但客户简称或客户全称为空，已跳过。`);
          return;
        }

        const base: CustomerProfile = existing ?? {
          id: fields.id?.trim() || createId("cust"),
          shortName: "",
          fullName: "",
          customerType: "其他",
          status: "正常",
          contactName: "",
          mobile: "",
          phone: "",
          wechat: "",
          email: "",
          invoiceTitle: "",
          taxNumber: "",
          invoiceAddress: "",
          invoicePhone: "",
          bankName: "",
          bankAccount: "",
          startupPeriodMonth: "",
          startupOpeningBalance: 0,
          defaultPaymentTerm: "月结",
          statementDay: "每月25日",
          paymentDay: "次月10日",
          currency: "人民币",
          needInvoiceBeforePayment: false,
          shippingAddress: "",
          invoiceMailingAddress: "",
          note: "",
          createdAt: today,
          updatedAt: today,
        };

        const nextProfile = withImportedFields(base, fields);
        if (existing) {
          profiles[matchIndex] = nextProfile;
          updatedCount += 1;
        } else {
          profiles.unshift(nextProfile);
          addedCount += 1;
        }
        selectedImportedId = nextProfile.id;
        syncCustomer(nextProfile);
      });

      return { ...currentStore, customerProfiles: profiles, customers };
    });

    if (selectedImportedId) setSelectedCustomerId(selectedImportedId);
    const warningText = warnings.length > 0 ? `\n\n提示：\n${warnings.slice(0, 8).join("\n")}${warnings.length > 8 ? "\n..." : ""}` : "";
    window.alert(`客户资料导入完成：新增 ${addedCount} 个，更新 ${updatedCount} 个，跳过 ${skippedCount} 行。${warningText}`);
  }

  function hasCustomerBusinessRecords(customerId: string) {
    return (
      store.styleAccounts.some((account) => account.customerId === customerId) ||
      store.monthlyStatements.some((statement) => statement.customerId === customerId) ||
      store.statementItems.some((item) => item.customerId === customerId) ||
      (store.statementAdjustments ?? []).some((adjustment) => adjustment.customerId === customerId) ||
      store.customerReceipts.some((receipt) => receipt.customerId === customerId) ||
      store.receiptAllocations.some((allocation) => allocation.customerId === customerId)
    );
  }

  function deactivateCustomerProfile(customerId: string) {
    const profile = store.customerProfiles.find((item) => item.id === customerId);
    if (!profile) return;
    upsertCustomerProfile({ ...profile, status: "暂停合作" });
  }

  function deleteCustomerProfile(customerId: string) {
    if (hasCustomerBusinessRecords(customerId)) {
      window.alert("该客户已有对账或收款记录，不能删除。可以将客户状态改为暂停合作。");
      return;
    }
    if (!window.confirm("确认删除该客户资料吗？")) return;
    updateStore((currentStore) => ({
      ...currentStore,
      customerProfiles: currentStore.customerProfiles.filter((profile) => profile.id !== customerId),
      customers: currentStore.customers.filter((customer) => customer.id !== customerId),
    }));
    if (selectedCustomerId === customerId) {
      const nextProfile = store.customerProfiles.find((profile) => profile.id !== customerId);
      setSelectedCustomerId(nextProfile?.id ?? "");
    }
  }

  function isStatementLockedById(statementId: string) {
    const statement = store.monthlyStatements.find((item) => item.id === statementId);
    return !!statement && getStatementLifecycle(statement) === "locked";
  }

  function createStatement(values: {
    customerId: string;
    periodMonth: string;
    openingBalance: number;
    dueDate: string;
    note: string;
  }) {
    const existingStatement = store.monthlyStatements.find(
      (statement) => statement.customerId === values.customerId && statement.periodMonth === values.periodMonth,
    );
    if (existingStatement) {
      setSelectedCustomerId(existingStatement.customerId);
      setSelectedPeriod(existingStatement.periodMonth);
      return;
    }

    const today = getTodayString();
    const statement: MonthlyStatement = {
      id: createId("stmt"),
      customerId: values.customerId,
      periodMonth: values.periodMonth,
      openingBalance: values.openingBalance,
      currentReceivable: 0,
      currentReceived: 0,
      currentInvoiced: 0,
      closingBalance: values.openingBalance,
      status: "草稿",
      lifecycle: "draft",
      dueDate: values.dueDate || undefined,
      version: 1,
      lastModifiedAt: today,
      lastModifiedBy: currentUserLabel,
      note: values.note,
      createdAt: today,
      updatedAt: today,
    };
    updateStore((currentStore) => ({ ...currentStore, monthlyStatements: [statement, ...currentStore.monthlyStatements] }));
    setSelectedCustomerId(statement.customerId);
    setSelectedPeriod(statement.periodMonth);
  }

  function appendStatementHistory(
    currentStore: typeof store,
    statement: MonthlyStatement,
    action: StatementHistoryAction,
    statusBefore: StatementLifecycle,
    statusAfter: StatementLifecycle,
    extra?: { method?: import("./models").ConfirmationMethod; note?: string },
  ): StatementConfirmationHistory[] {
    const entry: StatementConfirmationHistory = {
      id: createId("sth"),
      statementId: statement.id,
      version: getStatementVersion(statement),
      action,
      statusBefore,
      statusAfter,
      confirmedAmount: roundMoney(Math.max(statement.closingBalance, 0)),
      operatorId: auth.user?.id ?? "local-dev-user",
      operatorName: currentUserLabel ?? "未知用户",
      occurredAt: `${getTodayString()} ${new Date().toTimeString().slice(0, 5)}`,
      method: extra?.method,
      note: extra?.note,
    };
    return [...(currentStore.statementConfirmationHistories ?? []), entry];
  }

  function sendStatement(statementId: string) {
    const today = getTodayString();
    updateStore((currentStore) => {
      const statement = currentStore.monthlyStatements.find((item) => item.id === statementId);
      if (!statement || getStatementLifecycle(statement) !== "draft") return currentStore;
      const nextStatement: MonthlyStatement = {
        ...statement,
        lifecycle: "sent",
        sentAt: today,
        sentBy: currentUserLabel,
        lastModifiedAt: today,
        lastModifiedBy: currentUserLabel,
        updatedAt: today,
      };
      return {
        ...currentStore,
        monthlyStatements: currentStore.monthlyStatements.map((item) => (item.id === statementId ? nextStatement : item)),
        statementConfirmationHistories: appendStatementHistory(currentStore, nextStatement, "send", "draft", "sent"),
      };
    });
  }

  function withdrawStatement(statementId: string) {
    const today = getTodayString();
    updateStore((currentStore) => {
      const statement = currentStore.monthlyStatements.find((item) => item.id === statementId);
      if (!statement || getStatementLifecycle(statement) !== "sent") return currentStore;
      const nextStatement: MonthlyStatement = {
        ...statement,
        lifecycle: "draft",
        sentAt: undefined,
        sentBy: undefined,
        lastModifiedAt: today,
        lastModifiedBy: currentUserLabel,
        updatedAt: today,
      };
      return {
        ...currentStore,
        monthlyStatements: currentStore.monthlyStatements.map((item) => (item.id === statementId ? nextStatement : item)),
        statementConfirmationHistories: appendStatementHistory(currentStore, nextStatement, "withdraw", "sent", "draft"),
      };
    });
  }

  function confirmStatement(statementId: string, values: { confirmedAt: string; confirmationMethod: import("./models").ConfirmationMethod; confirmedBy: string; confirmationNote: string }) {
    const today = getTodayString();
    updateStore((currentStore) => {
      const statement = currentStore.monthlyStatements.find((item) => item.id === statementId);
      if (!statement || getStatementLifecycle(statement) !== "sent") return currentStore;
      const hadConfirmedBefore = (currentStore.statementConfirmationHistories ?? []).some(
        (history) => history.statementId === statementId && history.action === "confirm",
      );
      const nextStatement: MonthlyStatement = {
        ...statement,
        lifecycle: "confirmed",
        status: statement.closingBalance <= 0 ? statement.status : "已确认",
        confirmedAt: values.confirmedAt,
        confirmedBy: values.confirmedBy || currentUserLabel,
        confirmationMethod: values.confirmationMethod,
        confirmationNote: values.confirmationNote,
        version: getStatementVersion(statement) + (hadConfirmedBefore ? 1 : 0),
        lastModifiedAt: today,
        lastModifiedBy: currentUserLabel,
        updatedAt: today,
      };
      return {
        ...currentStore,
        monthlyStatements: currentStore.monthlyStatements.map((item) => (item.id === statementId ? nextStatement : item)),
        statementConfirmationHistories: appendStatementHistory(currentStore, nextStatement, "confirm", "sent", "confirmed", {
          method: values.confirmationMethod,
          note: values.confirmationNote,
        }),
      };
    });
  }

  function unconfirmStatement(statementId: string, reason: string) {
    const today = getTodayString();
    updateStore((currentStore) => {
      const statement = currentStore.monthlyStatements.find((item) => item.id === statementId);
      if (!statement || getStatementLifecycle(statement) !== "confirmed") return currentStore;
      const nextStatement: MonthlyStatement = {
        ...statement,
        lifecycle: "draft",
        confirmedAt: undefined,
        confirmedBy: undefined,
        confirmationMethod: undefined,
        confirmationNote: undefined,
        lastModifiedAt: today,
        lastModifiedBy: currentUserLabel,
        updatedAt: today,
      };
      return {
        ...currentStore,
        monthlyStatements: currentStore.monthlyStatements.map((item) => (item.id === statementId ? nextStatement : item)),
        statementConfirmationHistories: appendStatementHistory(currentStore, nextStatement, "unconfirm", "confirmed", "draft", {
          note: reason,
        }),
      };
    });
  }

  function lockStatement(statementId: string) {
    const today = getTodayString();
    updateStore((currentStore) => {
      const statement = currentStore.monthlyStatements.find((item) => item.id === statementId);
      if (!statement || getStatementLifecycle(statement) !== "confirmed") return currentStore;
      const nextStatement: MonthlyStatement = {
        ...statement,
        lifecycle: "locked",
        lockedAt: today,
        lockedBy: currentUserLabel,
        lastModifiedAt: today,
        lastModifiedBy: currentUserLabel,
        updatedAt: today,
      };
      return {
        ...currentStore,
        monthlyStatements: currentStore.monthlyStatements.map((item) => (item.id === statementId ? nextStatement : item)),
        statementConfirmationHistories: appendStatementHistory(currentStore, nextStatement, "lock", "confirmed", "locked"),
      };
    });
  }

  function upsertStatementItem(values: {
    statementId: string;
    customerId: string;
    styleNo: string;
    receivableAmount: number;
    note: string;
  }, itemId?: string) {
    if (isStatementLockedById(values.statementId)) {
      window.alert("该月度对账单已锁账，款号应收不能修改。如需调整请先解锁（反确认）。");
      return;
    }
    const today = getTodayString();
    if (itemId) {
      updateStore((currentStore) => {
        const styleAccountId = currentStore.statementItems.find((item) => item.id === itemId)?.styleAccountId;
        return {
          ...currentStore,
          styleAccounts: currentStore.styleAccounts.map((account) =>
            account.id === styleAccountId
              ? { ...account, customerId: values.customerId, styleNo: values.styleNo, updatedAt: today }
              : account,
          ),
          statementItems: currentStore.statementItems.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  statementId: values.statementId,
                  customerId: values.customerId,
                  receivableAmount: values.receivableAmount,
                  note: values.note,
                }
              : item,
          ),
        };
      });
      return;
    }

    const styleAccount: StyleAccount = {
      id: createId("style"),
      customerId: values.customerId,
      styleNo: values.styleNo,
      remark: values.note,
      receivableRecords: [
        {
          id: createId("recv"),
          date: `${store.monthlyStatements.find((statement) => statement.id === values.statementId)?.periodMonth ?? selectedPeriod}-01`,
          amount: values.receivableAmount,
          remark: values.note,
        },
      ],
      invoiceRecords: [],
      paymentRecords: [],
      createdAt: today,
      updatedAt: today,
    };
    const statementItem: StatementItem = {
      id: createId("item"),
      statementId: values.statementId,
      customerId: values.customerId,
      styleAccountId: styleAccount.id,
      receivableAmount: values.receivableAmount,
      note: values.note,
    };
    updateStore((currentStore) => ({
      ...currentStore,
      styleAccounts: [styleAccount, ...currentStore.styleAccounts],
      statementItems: [statementItem, ...currentStore.statementItems],
    }));
    setSelectedItemId(statementItem.id);
  }

  function deleteStatementItem(itemId: string) {
    setPendingStatementItemDeleteId(itemId);
  }

  function confirmDeleteStatementItem() {
    if (!pendingStatementItemDeleteId) return;
    const item = store.statementItems.find((entry) => entry.id === pendingStatementItemDeleteId);
    if (item && isStatementLockedById(item.statementId)) {
      window.alert("该月度对账单已锁账，款号应收不能删除。");
      setPendingStatementItemDeleteId(undefined);
      return;
    }
    updateStore((currentStore) => ({
      ...currentStore,
      statementItems: currentStore.statementItems.filter((item) => item.id !== pendingStatementItemDeleteId),
    }));
    if (selectedItemId === pendingStatementItemDeleteId) setSelectedItemId("");
    setPendingStatementItemDeleteId(undefined);
  }

  function upsertStatementAdjustment(adjustment: StatementAdjustment) {
    if (isStatementLockedById(adjustment.statementId)) {
      window.alert("该月度对账单已锁账，扣款调整不能修改。如需调整请先解锁（反确认）。");
      return;
    }
    updateStore((currentStore) => {
      const exists = (currentStore.statementAdjustments ?? []).some((item) => item.id === adjustment.id);
      return {
        ...currentStore,
        statementAdjustments: exists
          ? currentStore.statementAdjustments.map((item) => (item.id === adjustment.id ? adjustment : item))
          : [adjustment, ...(currentStore.statementAdjustments ?? [])],
      };
    });
  }

  function deleteStatementAdjustment(adjustmentId: string) {
    setPendingAdjustmentDeleteId(adjustmentId);
  }

  function confirmDeleteStatementAdjustment() {
    if (!pendingAdjustmentDeleteId) return;
    const adjustment = (store.statementAdjustments ?? []).find((entry) => entry.id === pendingAdjustmentDeleteId);
    if (adjustment && isStatementLockedById(adjustment.statementId)) {
      window.alert("该月度对账单已锁账，扣款调整不能删除。");
      setPendingAdjustmentDeleteId(undefined);
      return;
    }
    updateStore((currentStore) => ({
      ...currentStore,
      statementAdjustments: (currentStore.statementAdjustments ?? []).filter((item) => item.id !== pendingAdjustmentDeleteId),
    }));
    setPendingAdjustmentDeleteId(undefined);
  }

  function saveInvoicePool(customerId: string, invoices: CustomerInvoice[], deletedInvoiceIds: string[]) {
    const deletedIds = new Set(deletedInvoiceIds);
    updateStore((currentStore) => ({
      ...currentStore,
      customerInvoices: [
        ...invoices,
        ...(currentStore.customerInvoices ?? []).filter(
          (invoice) => invoice.customerId !== customerId && !deletedIds.has(invoice.id),
        ),
      ],
      invoiceAllocations: (currentStore.invoiceAllocations ?? []).filter((allocation) => !deletedIds.has(allocation.invoiceId)),
    }));
  }

  function saveReceiptPool(customerId: string, receipts: CustomerReceipt[], deletedReceiptIds: string[]) {
    const deletedIds = new Set(deletedReceiptIds);
    updateStore((currentStore) => ({
      ...currentStore,
      customerReceipts: [
        ...receipts,
        ...currentStore.customerReceipts.filter(
          (receipt) => receipt.customerId !== customerId && !deletedIds.has(receipt.id),
        ),
      ],
      receiptAllocations: currentStore.receiptAllocations.filter((allocation) => !deletedIds.has(allocation.receiptId)),
    }));
  }

  function updateReceipt(receipt: CustomerReceipt) {
    updateStore((currentStore) => ({
      ...currentStore,
      customerReceipts: currentStore.customerReceipts.map((item) =>
        item.id === receipt.id
          ? item.isLocked
            ? item
            : { ...receipt, amount: roundMoney(receipt.amount), updatedAt: getTodayString() }
          : item,
      ),
    }));
  }

  function deleteCustomerReceipt(receiptId: string) {
    updateStore((currentStore) => {
      const receipt = currentStore.customerReceipts.find((item) => item.id === receiptId);
      if (!receipt || receipt.isLocked) return currentStore;
      return {
        ...currentStore,
        customerReceipts: currentStore.customerReceipts.filter((item) => item.id !== receiptId),
        receiptAllocations: currentStore.receiptAllocations.filter((allocation) => allocation.receiptId !== receiptId),
      };
    });
  }

  function updateCustomerInvoice(invoice: CustomerInvoice) {
    updateStore((currentStore) => ({
      ...currentStore,
      customerInvoices: (currentStore.customerInvoices ?? []).map((item) =>
        item.id === invoice.id
          ? item.isLocked
            ? item
            : { ...invoice, amount: roundMoney(invoice.amount), updatedAt: getTodayString() }
          : item,
      ),
    }));
  }

  function deleteCustomerInvoice(invoiceId: string) {
    updateStore((currentStore) => {
      const invoice = (currentStore.customerInvoices ?? []).find((item) => item.id === invoiceId);
      if (!invoice || invoice.isLocked) return currentStore;
      return {
        ...currentStore,
        customerInvoices: (currentStore.customerInvoices ?? []).filter((item) => item.id !== invoiceId),
        invoiceAllocations: (currentStore.invoiceAllocations ?? []).filter((allocation) => allocation.invoiceId !== invoiceId),
      };
    });
  }

  function importReceipts(rows: ReceiptImportRow[], parseWarnings: string[]) {
    if (rows.length === 0) {
      window.alert(parseWarnings[0] ?? "没有可导入的收款记录。");
      return;
    }

    const today = getTodayString();
    let addedCount = 0;
    let duplicatedCount = 0;
    let skippedCount = 0;
    const warnings = [...parseWarnings];

    updateStore((currentStore) => {
      const nextReceipts = [...currentStore.customerReceipts];

      function normalize(value?: string) {
        return (value ?? "").trim().toLowerCase();
      }

      function findCustomerId(customerName: string) {
        const keyword = normalize(customerName);
        const matched = currentStore.customers.filter((customer) => {
          const profile = currentStore.customerProfiles.find((item) => item.id === customer.id);
          return [customer.name, profile?.shortName, profile?.fullName].some((name) => {
            const normalizedName = normalize(name);
            return normalizedName === keyword || normalizedName.includes(keyword) || keyword.includes(normalizedName);
          });
        });
        return matched.length === 1 ? matched[0].id : "";
      }

      function isDuplicate(receipt: CustomerReceipt) {
        const transactionNo = normalize(receipt.transactionNo);
        return nextReceipts.some(
          (item) => {
            const existingTransactionNo = normalize(item.transactionNo);
            if (transactionNo && existingTransactionNo === transactionNo) return true;
            return (
              !transactionNo &&
              item.customerId === receipt.customerId &&
              item.receiptDate === receipt.receiptDate &&
              item.amount === receipt.amount &&
              item.method === receipt.method &&
              existingTransactionNo === transactionNo
            );
          },
        );
      }

      rows.forEach((row) => {
        const customerId = findCustomerId(row.customerName);
        if (!customerId) {
          skippedCount += 1;
          warnings.push(`第 ${row.sourceRow} 行客户“${row.customerName}”未匹配到唯一客户，已跳过。`);
          return;
        }

        const receipt: CustomerReceipt = {
          id: createId("receipt"),
          customerId,
          receiptDate: row.receiptDate,
          amount: roundMoney(row.amount),
          method: row.method,
          isLocked: false,
          transactionNo: row.transactionNo,
          note: row.note,
          createdAt: today,
          updatedAt: today,
        };

        if (isDuplicate(receipt)) {
          duplicatedCount += 1;
          return;
        }

        nextReceipts.unshift(receipt);
        addedCount += 1;
      });

      return { ...currentStore, customerReceipts: nextReceipts };
    });

    const warningText = warnings.length > 0 ? `\n\n提示：\n${warnings.slice(0, 8).join("\n")}${warnings.length > 8 ? "\n..." : ""}` : "";
    window.alert(`收款导入完成：新增 ${addedCount} 笔，重复 ${duplicatedCount} 笔，跳过 ${skippedCount} 行。${warningText}`);
  }

  function importInvoices(rows: InvoiceImportRow[], parseWarnings: string[]) {
    if (rows.length === 0) {
      window.alert(parseWarnings[0] ?? "没有可导入的开票记录。");
      return;
    }

    let addedCount = 0;
    let duplicatedCount = 0;
    let skippedCount = 0;
    const warnings = [...parseWarnings];

    updateStore((currentStore) => {
      function normalize(value?: string) {
        return (value ?? "").trim().toLowerCase();
      }

      function findCustomerId(customerName: string) {
        const keyword = normalize(customerName);
        const matched = currentStore.customers.filter((customer) => {
          const profile = currentStore.customerProfiles.find((item) => item.id === customer.id);
          return [customer.name, profile?.shortName, profile?.fullName, profile?.invoiceTitle].some((name) => {
            const normalizedName = normalize(name);
            return normalizedName === keyword || normalizedName.includes(keyword) || keyword.includes(normalizedName);
          });
        });
        return matched.length === 1 ? matched[0].id : "";
      }

      function findStyleAccount(customerId: string, styleNo: string) {
        const keyword = normalize(styleNo);
        if (!keyword) return undefined;
        const matched = currentStore.styleAccounts.filter(
          (account) => account.customerId === customerId && normalize(account.styleNo) === keyword,
        );
        return matched.length === 1 ? matched[0] : undefined;
      }

      const nextInvoices = [...(currentStore.customerInvoices ?? [])];
      const nextAllocations = [...(currentStore.invoiceAllocations ?? [])];

      function isDuplicate(invoice: CustomerInvoice) {
        const invoiceNo = normalize(invoice.invoiceNo);
        return nextInvoices.some((item) => {
          const existingInvoiceNo = normalize(item.invoiceNo);
          if (invoiceNo && existingInvoiceNo === invoiceNo) return true;
          return !invoiceNo && item.customerId === invoice.customerId && item.invoiceDate === invoice.invoiceDate && item.amount === invoice.amount;
        });
      }

      rows.forEach((row) => {
        const customerId = findCustomerId(row.customerName);
        if (!customerId) {
          skippedCount += 1;
          warnings.push(`第 ${row.sourceRow} 行客户“${row.customerName}”未匹配到唯一客户，已跳过。`);
          return;
        }

        const targetAccount = findStyleAccount(customerId, row.styleNo);
        const invoice: CustomerInvoice = {
          id: createId("invoice"),
          customerId,
          invoiceDate: row.invoiceDate,
          invoiceNo: row.invoiceNo,
          amount: roundMoney(row.amount),
          isLocked: false,
          note: row.note,
          createdAt: getTodayString(),
          updatedAt: getTodayString(),
        };

        if (isDuplicate(invoice)) {
          duplicatedCount += 1;
          return;
        }

        nextInvoices.unshift(invoice);
        const targetStatement = currentStore.monthlyStatements.find(
          (statement) => statement.customerId === customerId && statement.periodMonth === row.invoiceDate.slice(0, 7),
        );
        if (targetAccount && targetStatement) {
          nextAllocations.unshift({
            id: createId("invoice-alloc"),
            invoiceId: invoice.id,
            customerId,
            statementId: targetStatement.id,
            styleAccountId: targetAccount.id,
            allocatedAmount: invoice.amount,
            note: row.note || "按导入款号自动分配",
          });
        } else if (row.styleNo) {
          warnings.push(`第 ${row.sourceRow} 行款号“${row.styleNo}”未匹配到对应月度单，已导入开票池，待手动分配。`);
        }
        addedCount += 1;
      });

      return {
        ...currentStore,
        customerInvoices: nextInvoices,
        invoiceAllocations: nextAllocations,
      };
    });

    const warningText = warnings.length > 0 ? `\n\n提示：\n${warnings.slice(0, 8).join("\n")}${warnings.length > 8 ? "\n..." : ""}` : "";
    window.alert(`开票导入完成：新增 ${addedCount} 条，重复 ${duplicatedCount} 条，跳过 ${skippedCount} 行。${warningText}`);
  }

  function createAllocation(values: ReceiptAllocation | ReceiptAllocation[]) {
    const nextAllocations = (Array.isArray(values) ? values : [values]).map((allocation) => ({
      ...allocation,
      createdBy: allocation.createdBy ?? currentUserLabel,
      createdAt: allocation.createdAt ?? new Date().toISOString(),
    }));
    if (nextAllocations.length === 0) return;
    updateStore((currentStore) => ({
      ...currentStore,
      receiptAllocations: [...nextAllocations, ...currentStore.receiptAllocations],
    }));
  }

  function createInvoiceAllocation(values: InvoiceAllocation | InvoiceAllocation[]) {
    const nextAllocations = Array.isArray(values) ? values : [values];
    if (nextAllocations.length === 0) return;
    updateStore((currentStore) => ({
      ...currentStore,
      invoiceAllocations: [...nextAllocations, ...(currentStore.invoiceAllocations ?? [])],
    }));
  }

  function deleteAllocation(allocationId: string) {
    if (!window.confirm("确认撤销这条收款核销吗？撤销后对应账期未收余额将自动恢复，操作会记入操作日志。")) return;
    updateStore((currentStore) => ({
      ...currentStore,
      receiptAllocations: currentStore.receiptAllocations.filter((allocation) => allocation.id !== allocationId),
    }));
  }

  function deleteInvoiceAllocation(allocationId: string) {
    setPendingInvoiceAllocationDeleteId(allocationId);
  }

  function confirmDeleteInvoiceAllocation() {
    if (!pendingInvoiceAllocationDeleteId) return;
    updateStore((currentStore) => ({
      ...currentStore,
      invoiceAllocations: (currentStore.invoiceAllocations ?? []).filter(
        (allocation) => allocation.id !== pendingInvoiceAllocationDeleteId,
      ),
    }));
    setPendingInvoiceAllocationDeleteId(undefined);
  }

  function exportCurrentStatementWord() {
    if (!selectedCustomer || !selectedStatementSummary) return;
    const statement = selectedStatementSummary.statement;
    const statementDate = formatDate(new Date());
    const openingBalance = selectedStatementSummary.openingBalance;
    const currentTotal = selectedStatementSummary.styleReceivableTotal;
    const adjustmentNetTotal = roundMoney(selectedStatementSummary.increaseAdjustmentTotal - selectedStatementSummary.decreaseAdjustmentTotal);
    const deductionTotal = roundMoney(-selectedStatementSummary.decreaseAdjustmentTotal);
    const grandTotal = roundMoney(openingBalance + selectedStatementSummary.adjustedReceivable);
    const getAdjustmentStyleNo = (styleAccountId?: string) =>
      selectedStatementSummary.items.find((item) => item.styleAccount?.id === styleAccountId || item.item.styleAccountId === styleAccountId)?.styleAccount
        ?.styleNo ??
      store.styleAccounts.find((style) => style.id === styleAccountId)?.styleNo ??
      "整月调整";

    const tableStyle = "width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 14pt 0;";
    const thStyle = "border:1pt solid #8fa0b4;background:#edf2f7;padding:6pt 8pt;text-align:center;font-weight:bold;font-size:10.5pt;";
    const tdCenter = "border:1pt solid #8fa0b4;padding:6pt 8pt;text-align:center;font-size:10.5pt;";
    const tdAmount = "border:1pt solid #8fa0b4;padding:6pt 8pt;text-align:right;font-size:10.5pt;font-weight:bold;";
    const tdTotalLabel = "border:1pt solid #8fa0b4;background:#f8fafc;padding:6pt 8pt;text-align:left;font-size:10.5pt;font-weight:bold;";
    const tdTotalAmount = "border:1pt solid #8fa0b4;background:#f8fafc;padding:6pt 8pt;text-align:right;font-size:10.5pt;font-weight:bold;";

    const itemRows =
      selectedStatementSummary.items.length > 0
        ? selectedStatementSummary.items
            .map(
              (item, index) => `
                <tr>
                  <td style="${tdCenter}">${index + 1}</td>
                  <td style="${tdCenter}">${escapeHtml(item.styleAccount?.styleNo ?? "-")}</td>
                  <td style="${tdAmount}">¥ ${formatMoney(item.receivableAmount)}</td>
                </tr>`,
            )
            .join("")
        : `<tr><td colspan="3" style="${tdCenter}">暂无本月款号应收</td></tr>`;

    const adjustmentRows = selectedStatementSummary.adjustments
      .map((adjustment, index) => {
        const signedAmount = getAdjustmentSignedAmount(adjustment);
        return `
          <tr>
            <td style="${tdCenter}">${index + 1}</td>
            <td style="${tdCenter}">${escapeHtml(getAdjustmentStyleNo(adjustment.relatedStyleAccountId))}</td>
            <td style="${tdCenter}">${escapeHtml(adjustment.reason || adjustment.note || "-")}</td>
            <td style="${tdAmount}">${signedAmount >= 0 ? "+" : "-"} ¥ ${formatMoney(Math.abs(signedAmount))}</td>
          </tr>`;
      })
      .join("");

    const adjustmentSection =
      selectedStatementSummary.adjustments.length > 0
        ? `
          <p style="margin:16pt 0 8pt 0;text-align:center;font-size:13pt;font-weight:bold;">本月扣款 / 调整明细</p>
          <table width="100%" cellspacing="0" cellpadding="0" style="${tableStyle}">
            <tr>
              <th width="12%" style="${thStyle}">编号</th>
              <th width="28%" style="${thStyle}">关联款号</th>
              <th width="36%" style="${thStyle}">说明</th>
              <th width="24%" style="${thStyle}">金额</th>
            </tr>
            ${adjustmentRows}
            <tr>
              <td colspan="3" style="${tdTotalLabel}">调整合计</td>
              <td style="${tdTotalAmount}">${adjustmentNetTotal >= 0 ? "+" : "-"} ¥ ${formatMoney(Math.abs(adjustmentNetTotal))}</td>
            </tr>
          </table>`
        : "";

    const html = `<!DOCTYPE html>
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
        <head>
          <meta charset="utf-8" />
          <title>臻林纺织科技有限公司对账单</title>
          <!--[if gte mso 9]>
          <xml>
            <w:WordDocument>
              <w:View>Print</w:View>
              <w:Zoom>100</w:Zoom>
              <w:DoNotOptimizeForBrowser />
            </w:WordDocument>
          </xml>
          <![endif]-->
          <style>
            @page WordSection1 {
              size: 595.3pt 841.9pt;
              margin: 42pt 48pt 42pt 48pt;
              mso-page-orientation: portrait;
            }
            div.WordSection1 { page: WordSection1; }
            body {
              margin: 0;
              color: #172033;
              font-family: "Microsoft YaHei", SimSun, Arial, sans-serif;
              font-size: 10.5pt;
              background: #ffffff;
            }
            p { margin: 0; }
          </style>
        </head>
        <body>
          <div class="WordSection1">
            <p style="margin:0 0 18pt 0;text-align:center;font-size:18pt;font-weight:bold;">臻林纺织科技有限公司对账单</p>
            <table width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:0 0 14pt 0;">
              <tr>
                <td width="34%" style="padding:3pt 0;font-size:10.5pt;font-weight:bold;">对账客户：${escapeHtml(selectedCustomerName)}</td>
                <td width="33%" style="padding:3pt 0;font-size:10.5pt;font-weight:bold;">对账月份：${escapeHtml(statement.periodMonth)}</td>
                <td width="33%" style="padding:3pt 0;font-size:10.5pt;font-weight:bold;">制表日期：${escapeHtml(statementDate)}</td>
              </tr>
            </table>
            <table width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:0 0 16pt 0;">
              <tr>
                <td style="border:1pt solid #cbd5e1;background:#f8fafc;padding:8pt 10pt;font-size:11pt;font-weight:bold;">
                  期初余额：¥ ${formatMoney(openingBalance)}
                  <span style="font-size:9pt;font-weight:normal;color:#607086;">截至上月末，未结清的历史余额</span>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8pt 0;text-align:center;font-size:13pt;font-weight:bold;">本月对账明细</p>
            <table width="100%" cellspacing="0" cellpadding="0" style="${tableStyle}">
              <tr>
                <th width="16%" style="${thStyle}">编号</th>
                <th width="48%" style="${thStyle}">款号</th>
                <th width="36%" style="${thStyle}">本月应收金额</th>
              </tr>
              ${itemRows}
              <tr>
                <td colspan="2" style="${tdTotalLabel}">此月款号合计</td>
                <td style="${tdTotalAmount}">¥ ${formatMoney(currentTotal)}</td>
              </tr>
            </table>
            ${adjustmentSection}
            <table width="100%" cellspacing="0" cellpadding="0" style="${tableStyle}">
              <tr>
                <td width="65%" style="${tdTotalLabel}">期初余额</td>
                <td width="35%" style="${tdTotalAmount}">¥ ${formatMoney(openingBalance)}</td>
              </tr>
              <tr>
                <td style="${tdTotalLabel}">本月款号应收</td>
                <td style="${tdTotalAmount}">¥ ${formatMoney(currentTotal)}</td>
              </tr>
              <tr>
                <td style="${tdTotalLabel}">本月扣款合计</td>
                <td style="${tdTotalAmount}">- ¥ ${formatMoney(Math.abs(deductionTotal))}</td>
              </tr>
              <tr>
                <td style="${tdTotalLabel}">总合计</td>
                <td style="${tdTotalAmount}">¥ ${formatMoney(grandTotal)}</td>
              </tr>
            </table>
            <p style="margin:16pt 0 22pt 0;padding-top:8pt;border-top:1pt dashed #9aa8b8;font-size:10pt;">
              <strong>备注：</strong>如有异议，请于收到对账单后 3 日内反馈。
            </p>
            <table width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
              <tr>
                <td width="50%" style="font-size:10.5pt;font-weight:bold;">客户确认：__________</td>
                <td width="50%" style="font-size:10.5pt;font-weight:bold;">日期：__________</td>
              </tr>
            </table>
          </div>
        </body>
      </html>`;

    downloadWordDocument(`${selectedCustomerName}-${statement.periodMonth}-月度对账单.doc`, html);
  }

  return (
    <ClickSpark duration={420} sparkColor="#1f7a8c" sparkCount={8} sparkRadius={18} sparkSize={11}>
      <div className={`recon-shell ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}>
      <aside className="recon-sidebar">
        <Particles
          className="recon-sidebar-particles"
          moveParticlesOnHover
          particleBaseSize={82}
          particleColors={["#6f92e0", "#8fb5ff", "#2fb7c8"]}
          particleCount={360}
          particleHoverFactor={2.6}
          particleSpread={18}
          pixelRatio={1}
          speed={0.16}
        />
        <div className="recon-brand">
          <img alt="" className="recon-brand-logo" src="/zhenlin-logo-white.png" />
          <div>
            <strong>臻林客户对账系统</strong>
          </div>
        </div>

        <nav className="recon-nav" aria-label="对账系统导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={activeModule === item.id ? "is-active" : ""}
                key={item.id}
                onClick={() => setActiveModule(item.id)}
                title={item.label}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

      </aside>

      <main className="recon-main">
        <header className="recon-topbar">
          <div className="recon-topbar-title">
            <button
              aria-label={sidebarCollapsed ? "展开左侧导航" : "收起左侧导航"}
              className="recon-sidebar-toggle"
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              type="button"
            >
              <Menu size={22} />
            </button>
            <h1>{getModuleTitle(activeModule)}</h1>
          </div>
          <div className="recon-userbar">
            <div>
              <span>当前用户</span>
              <strong>{currentUserLabel}</strong>
            </div>
            <button className="recon-button recon-button-light" onClick={() => void auth.logout()} type="button">
              退出登录
            </button>
          </div>
        </header>

        {auth.user?.mustChangePassword && (
          <div className="recon-security-notice">
            当前账号仍在使用初始化密码，请尽快通过“系统设置”中的修改密码入口更换密码。
          </div>
        )}
        {showCloudNotice && <div className={`recon-cloud-notice is-${cloudStatus}`}>{cloudNotice}</div>}

        {activeModule === "customer" && (
          <CustomerStatementPanel
            customerSummaries={customerSummaries}
            detailTab={detailTab}
            draftFilters={draftFilters}
            filteredItems={filteredItems}
            onAddItem={() =>
              selectedStatement &&
              setModal({ type: "statementItem", customerId: selectedStatement.customerId, statementId: selectedStatement.id })
            }
            onAddStatement={() => setModal({ type: "statement", customerId: selectedCustomerId })}
            onOpenReceiptPool={() => selectedCustomerId && setModal({ type: "receiptPool", customerId: selectedCustomerId })}
            onOpenInvoicePool={() => selectedCustomerId && setModal({ type: "invoicePool", customerId: selectedCustomerId })}
            onApplyFilters={() => setFilters(draftFilters)}
            onDeleteAllocation={deleteAllocation}
            onDeleteAdjustment={deleteStatementAdjustment}
            onDeleteInvoiceAllocation={deleteInvoiceAllocation}
            onDeleteItem={deleteStatementItem}
            onEditItem={(item) =>
              selectedStatement && setModal({ type: "statementItem", item, customerId: selectedStatement.customerId, statementId: selectedStatement.id })
            }
            onExport={exportCurrentStatementWord}
            onPreview={() => selectedStatementSummary && setModal({ type: "statementPreview" })}
            onSaveAdjustment={upsertStatementAdjustment}
            onStatementSend={sendStatement}
            onStatementWithdraw={withdrawStatement}
            onStatementConfirm={(statementId) => setModal({ type: "statementConfirm", statementId })}
            onStatementUnconfirm={(statementId) => setModal({ type: "statementUnconfirm", statementId })}
            onStatementLock={(statementId) => {
              if (window.confirm("锁账后，该月度对账单的款号应收、扣款调整等核心金额原则上不能直接修改。确认继续锁账？")) {
                lockStatement(statementId);
              }
            }}
            onStatementShowHistory={(statementId) => setModal({ type: "statementHistory", statementId })}
            onFiltersChange={(nextFilters) => {
              setDraftFilters(nextFilters);
              setFilters(nextFilters);
            }}
            onPeriodChange={(period) => {
              const nextFilters = { ...draftFilters, customerName: "", styleNo: "" };
              setSelectedPeriod(period);
              setDraftFilters(nextFilters);
              setFilters(nextFilters);
            }}
            onResetFilters={() => {
              setDraftFilters(emptyFilters);
              setFilters(emptyFilters);
            }}
            onSelectCustomer={setSelectedCustomerId}
            onSelectItem={setSelectedItemId}
            onSetDetailTab={setDetailTab}
            periods={periods}
            receipts={store.customerReceipts}
            receiptAllocations={store.receiptAllocations}
            customerInvoices={store.customerInvoices ?? []}
            invoiceAllocations={store.invoiceAllocations ?? []}
            selectedAccount={selectedAccount}
            selectedCustomer={selectedCustomer}
            selectedCustomerName={selectedCustomerName}
            selectedCustomerId={selectedCustomerId}
            selectedItemSummary={selectedItemSummary}
            selectedPeriod={selectedPeriod}
            selectedStatementSummary={selectedStatementSummary}
            statement={selectedStatement}
            summary={allSummary}
          />
        )}

        {activeModule === "customerProfiles" && (
          <CustomerProfilesModule
            onDelete={deleteCustomerProfile}
            onImport={importCustomerProfiles}
            onSave={upsertCustomerProfile}
            onSelect={setSelectedCustomerId}
            profiles={customerProfiles}
            selectedCustomerId={selectedCustomerId}
            store={store}
          />
        )}
        {activeModule === "supplier" && <PlaceholderModule icon={Landmark} title="供应商对账模块开发中" />}
        {activeModule === "overview" && <OverviewModule customers={store.customers} store={store} summary={allSummary} />}
        {activeModule === "finance" && (
          <FinancialRecordsModule
            allocations={store.receiptAllocations}
            customerProfiles={store.customerProfiles}
            customers={store.customers}
            onDeleteReceipt={deleteCustomerReceipt}
            onDeleteInvoice={deleteCustomerInvoice}
            onImportInvoices={importInvoices}
            onImportReceipts={importReceipts}
            onSaveReceipt={updateReceipt}
            onSaveInvoice={updateCustomerInvoice}
            receipts={store.customerReceipts}
            invoices={store.customerInvoices ?? []}
            invoiceAllocations={store.invoiceAllocations ?? []}
          />
        )}
        {activeModule === "settings" && <SettingsModule auditLogs={store.auditLogs ?? []} />}
      </main>

      {modal?.type === "customer" && (
        <CustomerModal
          customer={modal.customer}
          onClose={() => setModal(null)}
          onSubmit={(values) => {
            upsertCustomer(values, modal.customer?.id);
            setModal(null);
          }}
        />
      )}
      {modal?.type === "statement" && (
        <StatementModal
          customers={activeCustomers}
          defaultCustomerId={modal.customerId || selectedCustomerId}
          getDueDateSuggestion={(customerId, periodMonth) =>
            suggestDueDate(periodMonth, getCustomerProfile(customerId, store)?.paymentTermDays)
          }
          getOpeningBalance={(customerId, periodMonth) => getDefaultOpeningBalance(customerId, periodMonth, store)}
          onClose={() => setModal(null)}
          onSubmit={(values) => {
            createStatement(values);
            setModal(null);
          }}
        />
      )}
      {modal?.type === "statementItem" && (
        <StatementItemModal
          customerId={modal.customerId}
          item={modal.item}
          statementId={modal.statementId}
          statements={store.monthlyStatements.filter((statement) => statement.customerId === modal.customerId)}
          styleAccount={modal.item ? store.styleAccounts.find((account) => account.id === modal.item?.styleAccountId) : undefined}
          onClose={() => setModal(null)}
          onSubmit={(values) => {
            upsertStatementItem(values, modal.item?.id);
            setModal(null);
          }}
        />
      )}
      {modal?.type === "receiptPool" && (
        <ReceiptPoolModal
          allocations={store.receiptAllocations}
          customer={store.customers.find((item) => item.id === modal.customerId)}
          receipts={store.customerReceipts.filter((receipt) => receipt.customerId === modal.customerId)}
          statements={store.monthlyStatements}
          store={store}
          onClose={() => setModal(null)}
          onSubmitAllocation={createAllocation}
          onSave={(receipts, deletedReceiptIds) => {
            saveReceiptPool(modal.customerId, receipts, deletedReceiptIds);
            setModal(null);
          }}
        />
      )}
      {modal?.type === "invoicePool" && (
        <InvoicePoolModal
          allocations={store.invoiceAllocations ?? []}
          customer={store.customers.find((item) => item.id === modal.customerId)}
          invoices={(store.customerInvoices ?? []).filter((invoice) => invoice.customerId === modal.customerId)}
          statements={store.monthlyStatements}
          store={store}
          onClose={() => setModal(null)}
          onSubmitAllocation={createInvoiceAllocation}
          onSave={(invoices, deletedInvoiceIds) => {
            saveInvoicePool(modal.customerId, invoices, deletedInvoiceIds);
            setModal(null);
          }}
        />
      )}
      {modal?.type === "allocation" && (
        <AllocationModal
          customerId={modal.customerId}
          defaultReceiptId={modal.receiptId}
          defaultStatementId={modal.statementId}
          receipts={store.customerReceipts}
          receiptAllocations={store.receiptAllocations}
          statements={store.monthlyStatements}
          store={store}
          onClose={() => setModal(modal.returnToPool ? { type: "receiptPool", customerId: modal.customerId } : null)}
          onSubmit={(allocation) => {
            createAllocation(allocation);
            setModal(modal.returnToPool ? { type: "receiptPool", customerId: modal.customerId } : null);
          }}
        />
      )}
      {modal?.type === "invoiceAllocation" && (
        <InvoiceAllocationModal
          customerId={modal.customerId}
          defaultInvoiceId={modal.invoiceId}
          defaultStatementId={modal.statementId}
          invoiceAllocations={store.invoiceAllocations ?? []}
          invoices={store.customerInvoices ?? []}
          statements={store.monthlyStatements}
          store={store}
          onClose={() => setModal(modal.returnToPool ? { type: "invoicePool", customerId: modal.customerId } : null)}
          onSubmit={(allocation) => {
            createInvoiceAllocation(allocation);
            setModal(modal.returnToPool ? { type: "invoicePool", customerId: modal.customerId } : null);
          }}
        />
      )}
      {modal?.type === "statementPreview" && selectedStatementSummary && (
        <StatementPreviewModal
          customerName={selectedCustomerName}
          onClose={() => setModal(null)}
          statementSummary={selectedStatementSummary}
        />
      )}
      {modal?.type === "statementConfirm" && (
        <StatementConfirmModal
          onClose={() => setModal(null)}
          onSubmit={(values) => {
            confirmStatement(modal.statementId, values);
            setModal(null);
          }}
        />
      )}
      {modal?.type === "statementUnconfirm" && (
        <StatementUnconfirmModal
          onClose={() => setModal(null)}
          onSubmit={(reason) => {
            unconfirmStatement(modal.statementId, reason);
            setModal(null);
          }}
        />
      )}
      {modal?.type === "statementHistory" && (
        <StatementHistoryModal
          histories={(store.statementConfirmationHistories ?? []).filter((history) => history.statementId === modal.statementId)}
          onClose={() => setModal(null)}
        />
      )}
      {pendingStatementItemDeleteId && (
        <ConfirmationDialog
          confirmLabel="确认删除"
          description="删除后，这条款号应收将从当前月度对账单中移除，并重新计算本月应收和未收金额。"
          onCancel={() => setPendingStatementItemDeleteId(undefined)}
          onConfirm={confirmDeleteStatementItem}
          title="确认删除这条款号应收？"
          tone="danger"
        />
      )}
      {pendingAdjustmentDeleteId && (
        <ConfirmationDialog
          confirmLabel="确认删除"
          description="删除后，该扣款或调整金额将不再参与当前月度对账单及关联款号的金额计算。"
          onCancel={() => setPendingAdjustmentDeleteId(undefined)}
          onConfirm={confirmDeleteStatementAdjustment}
          title="确认删除这条扣款调整？"
          tone="danger"
        />
      )}
      {pendingInvoiceAllocationDeleteId && (
        <ConfirmationDialog
          confirmLabel="确认删除"
          description="删除后，这张发票会回到开票池的未分配状态，可以重新分配到正确的月份或款号。开票池中的原始发票不会被删除。"
          onCancel={() => setPendingInvoiceAllocationDeleteId(undefined)}
          onConfirm={confirmDeleteInvoiceAllocation}
          title="确认删除这条开票分配？"
          tone="danger"
        />
      )}
      </div>
    </ClickSpark>
  );
}

function CustomerStatementPanel(props: {
  customerSummaries: ReturnType<typeof summarizeCustomer>[];
  detailTab: DetailTab;
  draftFilters: Filters;
  filteredItems: NonNullable<ReturnType<typeof summarizeStatement>["items"]>;
  onAddItem(): void;
  onAddStatement(): void;
  onOpenInvoicePool(): void;
  onOpenReceiptPool(): void;
  onApplyFilters(): void;
  onDeleteAllocation(allocationId: string): void;
  onDeleteAdjustment(adjustmentId: string): void;
  onDeleteInvoiceAllocation(allocationId: string): void;
  onDeleteItem(itemId: string): void;
  onEditItem(item: StatementItem): void;
  onExport(): void;
  onPreview(): void;
  onSaveAdjustment(adjustment: StatementAdjustment): void;
  onStatementSend(statementId: string): void;
  onStatementWithdraw(statementId: string): void;
  onStatementConfirm(statementId: string): void;
  onStatementUnconfirm(statementId: string): void;
  onStatementLock(statementId: string): void;
  onStatementShowHistory(statementId: string): void;
  onFiltersChange(filters: Filters): void;
  onPeriodChange(period: string): void;
  onResetFilters(): void;
  onSelectCustomer(customerId: string): void;
  onSelectItem(itemId: string): void;
  onSetDetailTab(tab: DetailTab): void;
  periods: string[];
  receiptAllocations: ReceiptAllocation[];
  receipts: CustomerReceipt[];
  customerInvoices: CustomerInvoice[];
  invoiceAllocations: InvoiceAllocation[];
  selectedAccount?: StyleAccount;
  selectedCustomer?: Customer;
  selectedCustomerName: string;
  selectedCustomerId: string;
  selectedItemSummary?: ReturnType<typeof summarizeStatement>["items"][number];
  selectedPeriod: string;
  selectedStatementSummary: ReturnType<typeof summarizeStatement> | null;
  statement?: MonthlyStatement;
  summary: ReturnType<typeof summarizeAll>;
}) {
  const [customerSearchText, setCustomerSearchText] = useState("");
  const styleTableRef = useRef<HTMLTableElement | null>(null);
  const [styleColumnWidths, setStyleColumnWidths] = useState<number[] | null>(() =>
    loadSpreadsheetGridColumnWidths(STYLE_GRID_COLUMN_WIDTHS_STORAGE_KEY, styleGridColumns.length),
  );
  const styleTableWidth = styleColumnWidths?.reduce((sum, width) => sum + width, 0) ?? 0;
  const customerButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const matchedCustomerId = useMemo(() => {
    const keyword = customerSearchText.trim().toLowerCase();
    if (!keyword) return "";
    return (
      props.customerSummaries.find((summary) => summary.customerName.toLowerCase().includes(keyword))?.customerId ?? ""
    );
  }, [customerSearchText, props.customerSummaries]);

  useEffect(() => {
    if (!matchedCustomerId) return;
    customerButtonRefs.current[matchedCustomerId]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [matchedCustomerId]);

  useEffect(() => {
    if (!styleColumnWidths) return;
    try {
      window.localStorage.setItem(STYLE_GRID_COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(styleColumnWidths));
    } catch {
      // 列宽记录失败不影响款号对账使用。
    }
  }, [styleColumnWidths]);

  function beginStyleColumnResize(columnIndex: number, event: ReactPointerEvent<HTMLButtonElement>) {
    beginSpreadsheetColumnResize(
      styleTableRef.current,
      styleColumnWidths,
      styleGridColumns.map((column) => column.minWidth),
      columnIndex,
      event,
      setStyleColumnWidths,
    );
  }

  return (
    <div className="recon-workspace">
      <section className="recon-stat-grid recon-stat-grid-six" aria-label="月度统计卡片">
        <StatCard label="实时期初余额" value={props.selectedStatementSummary?.realtimeOpeningBalance ?? 0} icon={RotateCcw} />
        <StatCard label="本月款号应收" value={props.selectedStatementSummary?.styleReceivableTotal ?? 0} icon={BarChart3} />
        <StatCard
          label="本月调整"
          value={roundMoney((props.selectedStatementSummary?.increaseAdjustmentTotal ?? 0) - (props.selectedStatementSummary?.decreaseAdjustmentTotal ?? 0))}
          icon={ReceiptText}
        />
        <StatCard label="本月调整后应收" value={props.selectedStatementSummary?.adjustedReceivable ?? 0} icon={CreditCard} tone="warning" />
        <StatCard label="本月已收款" value={props.selectedStatementSummary?.currentReceived ?? 0} icon={CreditCard} tone="warning" />
        <StatCard label="期末未收" value={props.selectedStatementSummary?.closingBalance ?? 0} icon={Banknote} tone="warning" />
      </section>

      <section className="recon-ledger">
        <aside className="recon-customer-panel">
          <div className="recon-panel-head">
            <div>
              <span>客户列表</span>
              <strong>{props.customerSummaries.length} 个客户</strong>
            </div>
          </div>
          <label className="recon-customer-search">
            <Search size={15} />
            <input
              onChange={(event) => setCustomerSearchText(event.target.value)}
              placeholder="查找客户"
              value={customerSearchText}
            />
          </label>
          <div className="recon-customer-list">
            {props.customerSummaries.map((summary) => (
              <button
                className={[
                  summary.customerId === props.selectedCustomerId ? "is-selected" : "",
                  summary.customerId === matchedCustomerId ? "is-search-match" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={summary.customerId}
                onClick={() => props.onSelectCustomer(summary.customerId)}
                ref={(element) => {
                  customerButtonRefs.current[summary.customerId] = element;
                }}
                type="button"
              >
                <strong>{summary.customerName}</strong>
                <em>总未收 ¥ {formatMoney(summary.closingBalanceTotal)}</em>
              </button>
            ))}
          </div>
        </aside>

        <div className="recon-account-panel">
          <div className="recon-customer-summary recon-statement-summary">
            <div>
              <h2>{props.selectedCustomerName} / {props.selectedPeriod}</h2>
              {props.statement?.note && <small>{props.statement.note}</small>}
            </div>
            <div className="recon-statement-filter-actions">
              <label>
                <AnimatedSelect
                  ariaLabel="对账月份"
                  onChange={props.onPeriodChange}
                  options={toSelectOptions(props.periods)}
                  value={props.selectedPeriod}
                />
              </label>
              <label>
                <AnimatedSelect
                  ariaLabel="对账状态"
                  onChange={(value) =>
                    props.onFiltersChange({ customerName: "", styleNo: "", status: value as AccountStatus | "" })
                  }
                  options={[{ label: "全部状态", value: "" }, ...toSelectOptions(accountStatusOptions)]}
                  value={props.draftFilters.status}
                />
              </label>
              <button className="recon-button recon-button-primary" onClick={props.onAddStatement} type="button">
                <Plus size={16} />
                新增月度对账单
              </button>
            </div>
            <div className="recon-topbar-actions recon-statement-actions">
              <div className="recon-statement-actions-left">
                <button className="recon-button recon-button-light" disabled={!props.statement} onClick={props.onExport} type="button">
                  <FileDown size={16} />
                  导出 Word
                </button>
                <button className="recon-button recon-button-light" disabled={!props.statement} onClick={props.onPreview} type="button">
                  <Eye size={16} />
                  预览对账单
                </button>
                {props.statement && (() => {
                  const lifecycle = getStatementLifecycle(props.statement);
                  const statementId = props.statement.id;
                  return (
                    <div className="recon-statement-lifecycle">
                      <span className={`lifecycle-badge lifecycle-${lifecycle}`}>{statementLifecycleLabels[lifecycle]}</span>
                      <span className="lifecycle-version">V{getStatementVersion(props.statement)}</span>
                      {lifecycle === "draft" && (
                        <button className="recon-button recon-button-light" onClick={() => props.onStatementSend(statementId)} type="button">
                          标记已发送
                        </button>
                      )}
                      {lifecycle === "sent" && (
                        <>
                          <button className="recon-button recon-button-light" onClick={() => props.onStatementWithdraw(statementId)} type="button">
                            撤回至草稿
                          </button>
                          <button className="recon-button recon-button-primary" onClick={() => props.onStatementConfirm(statementId)} type="button">
                            确认客户已确认
                          </button>
                        </>
                      )}
                      {lifecycle === "confirmed" && (
                        <>
                          <button className="recon-button recon-button-primary" onClick={() => props.onStatementLock(statementId)} type="button">
                            锁账
                          </button>
                          <button className="recon-button recon-button-light" onClick={() => props.onStatementUnconfirm(statementId)} type="button">
                            反确认
                          </button>
                          <button className="recon-button recon-button-light" onClick={() => props.onStatementShowHistory(statementId)} type="button">
                            确认信息
                          </button>
                        </>
                      )}
                      {lifecycle === "locked" && (
                        <>
                          <span className="lifecycle-locked-info">
                            {props.statement.lockedAt ?? ""} {props.statement.lockedBy ?? ""} 锁账
                          </span>
                          <button className="recon-button recon-button-light" onClick={() => props.onStatementShowHistory(statementId)} type="button">
                            查看确认信息
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className="recon-statement-actions-right">
                <button className="recon-button recon-button-light" onClick={props.onOpenReceiptPool} type="button">
                  <CreditCard size={16} />
                  收款池
                </button>
                <button className="recon-button recon-button-light" onClick={props.onOpenInvoicePool} type="button">
                  <ReceiptText size={16} />
                  开票池
                </button>
                <button
                  className="recon-button recon-button-primary recon-statement-add-item"
                  disabled={!props.statement || (!!props.statement && getStatementLifecycle(props.statement) === "locked")}
                  onClick={props.onAddItem}
                  title={props.statement && getStatementLifecycle(props.statement) === "locked" ? "已锁账，不能修改款号应收" : undefined}
                  type="button"
                >
                  <Plus size={16} />
                  新增款号应收
                </button>
              </div>
            </div>
          </div>

          {!props.statement ? (
            <EmptyPanel text="当前客户在该月份还没有月度对账单，请先新增月度对账单。" />
          ) : (
            <>
              <div className="recon-table-wrap recon-style-table-wrap">
                <table
                  className="recon-table recon-style-table"
                  ref={styleTableRef}
                  style={{ minWidth: "100%", width: styleColumnWidths ? `${styleTableWidth}px` : "100%" }}
                >
                  <colgroup>
                    {styleGridColumns.map((column, index) => (
                      <col key={column.id} style={{ width: styleColumnWidths ? `${styleColumnWidths[index]}px` : column.width }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      {styleGridColumns.map((column, index) => (
                        <th key={column.id}>
                          <span>{column.label}</span>
                          {index < styleGridColumns.length - 1 && (
                            <button
                              aria-label={`调整${column.label}列宽`}
                              className="recon-column-resizer"
                              onPointerDown={(event) => beginStyleColumnResize(index, event)}
                              title="拖动调整列宽"
                              type="button"
                            />
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {props.filteredItems.map((itemSummary) => (
                      <tr className={itemSummary.item.id === props.selectedItemSummary?.item.id ? "is-active-row" : ""} key={itemSummary.item.id}>
                        <td>
                          <button className="recon-link-button" onClick={() => props.onSelectItem(itemSummary.item.id)} type="button">
                            {itemSummary.styleAccount?.styleNo ?? "-"}
                          </button>
                          {itemSummary.item.note && <small>{itemSummary.item.note}</small>}
                        </td>
                        <td>¥ {formatMoney(itemSummary.receivableAmount)}</td>
                        <td>¥ {formatMoney(itemSummary.invoicedAmount)}</td>
                        <td>¥ {formatMoney(itemSummary.paidAmount)}</td>
                        <td className={itemSummary.adjustmentNetAmount < 0 ? "is-danger" : itemSummary.adjustmentNetAmount > 0 ? "is-ok" : ""}>
                          {itemSummary.adjustmentNetAmount === 0
                            ? "¥ 0.00"
                            : `${itemSummary.adjustmentNetAmount > 0 ? "+" : "-"} ¥ ${formatMoney(Math.abs(itemSummary.adjustmentNetAmount))}`}
                        </td>
                        <td className={itemSummary.unpaidAmount > 0 ? "is-danger" : "is-ok"}>¥ {formatMoney(itemSummary.unpaidAmount)}</td>
                        <td>
                          <StatusPills labels={itemSummary.statusLabels} />
                        </td>
                        <td>
                          <div className="recon-row-actions">
                            <button onClick={() => props.onSelectItem(itemSummary.item.id)} title="查看" type="button">
                              <Eye size={15} />
                            </button>
                            <button
                              disabled={props.statement ? getStatementLifecycle(props.statement) === "locked" : false}
                              onClick={() => props.onEditItem(itemSummary.item)}
                              title={props.statement && getStatementLifecycle(props.statement) === "locked" ? "已锁账，不能编辑" : "编辑"}
                              type="button"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              disabled={props.statement ? getStatementLifecycle(props.statement) === "locked" : false}
                              onClick={() => props.onDeleteItem(itemSummary.item.id)}
                              title={props.statement && getStatementLifecycle(props.statement) === "locked" ? "已锁账，不能删除" : "删除"}
                              type="button"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {props.filteredItems.length === 0 && <EmptyPanel text="当前月度对账单没有符合条件的款号。" />}
              </div>
              {props.selectedStatementSummary && (
                <div className="recon-account-footer">
                  <div className="recon-detail-total">
                    <span>本月款号应收 ¥ {formatMoney(sumMoney(props.selectedStatementSummary.items.map((item) => item.receivableAmount)))}</span>
                    <span>本月款号未收 ¥ {formatMoney(sumMoney(props.selectedStatementSummary.items.map((item) => item.unpaidAmount)))}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <aside className="recon-detail-side">
          {props.statement ? (
            <StatementDetail
              account={props.selectedAccount}
              adjustments={props.selectedStatementSummary!.adjustments}
              allocations={props.receiptAllocations}
              customerInvoices={props.customerInvoices}
              detailTab={props.detailTab}
              invoiceAllocations={props.invoiceAllocations}
              itemSummary={props.selectedItemSummary}
              onDeleteAdjustment={props.onDeleteAdjustment}
              onDeleteAllocation={props.onDeleteAllocation}
              onDeleteInvoiceAllocation={props.onDeleteInvoiceAllocation}
              onSaveAdjustment={props.onSaveAdjustment}
              onSetDetailTab={props.onSetDetailTab}
              receipts={props.receipts}
              statement={props.statement}
              statementId={props.statement.id}
              statementLocked={getStatementLifecycle(props.statement) === "locked"}
              statementItems={props.selectedStatementSummary!.items}
            />
          ) : (
            <EmptyPanel text="新增月度对账单后，可在这里查看款号明细。" />
          )}
        </aside>
      </section>
    </div>
  );
}

function StatementDetail(props: {
  account?: StyleAccount;
  adjustments: StatementAdjustment[];
  allocations: ReceiptAllocation[];
  customerInvoices: CustomerInvoice[];
  detailTab: DetailTab;
  invoiceAllocations: InvoiceAllocation[];
  itemSummary?: ReturnType<typeof summarizeStatement>["items"][number];
  onDeleteAdjustment(adjustmentId: string): void;
  onDeleteAllocation(allocationId: string): void;
  onDeleteInvoiceAllocation(allocationId: string): void;
  onSaveAdjustment(adjustment: StatementAdjustment): void;
  onSetDetailTab(tab: DetailTab): void;
  receipts: CustomerReceipt[];
  statement: MonthlyStatement;
  statementId: string;
  statementLocked: boolean;
  statementItems: ReturnType<typeof summarizeStatement>["items"];
}) {
  const statementAllocations = props.allocations.filter((allocation) => allocation.statementId === props.statementId);
  const styleAllocations = statementAllocations.filter((allocation) => allocation.styleAccountId === props.account?.id);
  const statementOnlyAllocations = statementAllocations.filter((allocation) => !allocation.styleAccountId);
  const styleInvoiceAllocations = props.invoiceAllocations.filter(
    (allocation) => allocation.statementId === props.statementId && allocation.styleAccountId === props.account?.id,
  );
  const visibleAdjustments = props.adjustments;
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [viewingAdjustment, setViewingAdjustment] = useState<StatementAdjustment | null>(null);

  return (
    <section className="recon-detail">
      <div className="recon-detail-head">
        <div>
          <h3>款号明细</h3>
        </div>
        {props.account && <strong className="recon-detail-style-no">{props.account.styleNo}</strong>}
      </div>

      <div className="recon-detail-toolbar">
        <div className="recon-tabs" role="tablist">
          {[
            ["receivable", "明细"],
            ["adjustment", "扣款调整"],
            ["invoice", "开票记录"],
            ["payment", "收款核销"],
          ].map(([id, label]) => (
            <button className={props.detailTab === id ? "is-active" : ""} key={id} onClick={() => props.onSetDetailTab(id as DetailTab)} type="button">
              {label}
            </button>
          ))}
        </div>
        <div className="recon-detail-toolbar-actions">
          {props.detailTab === "adjustment" && (
            <button
              className="recon-button recon-button-warning"
              disabled={props.statementLocked}
              onClick={() => setIsAdjustmentModalOpen(true)}
              title={props.statementLocked ? "已锁账，不能新增扣款调整" : undefined}
              type="button"
            >
              <Plus size={16} />
              新增扣款
            </button>
          )}
        </div>
      </div>

      {props.detailTab === "receivable" && props.itemSummary && props.account && (
        <div className="recon-record-card">
          <table className="recon-detail-info-table">
            <tbody>
              <tr>
                <th>归属月份</th>
                <td>{props.statement.periodMonth}</td>
              </tr>
              <tr>
                <th>款号</th>
                <td>{props.account.styleNo}</td>
              </tr>
              <tr>
                <th>应收金额</th>
                <td>¥ {formatMoney(props.itemSummary.receivableAmount)}</td>
              </tr>
              <tr>
                <th>备注</th>
                <td>{props.itemSummary.item.note || "-"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {props.detailTab === "receivable" && (!props.itemSummary || !props.account) && <EmptyPanel text="请选择一个款号查看明细记录。" />}
      {props.detailTab === "adjustment" && (
        <StatementAdjustmentTable
          adjustments={visibleAdjustments}
          onDelete={props.onDeleteAdjustment}
          onView={setViewingAdjustment}
          statement={props.statement}
          statementItems={props.statementItems}
        />
      )}
      {props.detailTab === "invoice" && props.account && (
        <InvoiceRecordCards
          allocations={styleInvoiceAllocations}
          invoices={props.customerInvoices}
          onDelete={props.onDeleteInvoiceAllocation}
        />
      )}
      {props.detailTab === "invoice" && !props.account && <EmptyPanel text="请选择一个款号查看已分配开票记录。" />}
      {props.detailTab === "payment" && (
        <PaymentAllocationCards
          allocations={[...styleAllocations, ...statementOnlyAllocations]}
          onDelete={props.onDeleteAllocation}
          receipts={props.receipts}
        />
      )}
      {props.itemSummary && (
        <div className="recon-detail-footer">
          <div className="recon-detail-total">
            <span>款号未收 ¥ {formatMoney(props.itemSummary.unpaidAmount)}</span>
          </div>
        </div>
      )}
      {isAdjustmentModalOpen && (
        <StatementAdjustmentModal
          onClose={() => setIsAdjustmentModalOpen(false)}
          onSubmit={(adjustment) => {
            props.onSaveAdjustment(adjustment);
            setIsAdjustmentModalOpen(false);
          }}
          statement={props.statement}
          statementItems={props.statementItems}
        />
      )}
      {viewingAdjustment && (
        <StatementAdjustmentViewModal
          adjustment={viewingAdjustment}
          onClose={() => setViewingAdjustment(null)}
          onSave={(adjustment) => {
            props.onSaveAdjustment(adjustment);
            setViewingAdjustment(adjustment);
          }}
          statementItems={props.statementItems}
        />
      )}
    </section>
  );
}

function StatementAdjustmentTable(props: {
  adjustments: StatementAdjustment[];
  onDelete(adjustmentId: string): void;
  onView(adjustment: StatementAdjustment): void;
  statement: MonthlyStatement;
  statementItems: ReturnType<typeof summarizeStatement>["items"];
}) {
  const styleOptions = props.statementItems
    .map((item) => ({ id: item.styleAccount?.id ?? item.item.styleAccountId, styleNo: item.styleAccount?.styleNo ?? "-" }))
    .filter((item) => item.id);
  const adjustmentTotal = roundMoney(props.adjustments.reduce((sum, adjustment) => sum + getAdjustmentSignedAmount(adjustment), 0));

  return (
    <div className="recon-mini-card-list recon-adjustment-card-list">
      {props.adjustments.map((adjustment) => {
        const signedAmount = getAdjustmentSignedAmount(adjustment);
        const styleNo = styleOptions.find((style) => style.id === adjustment.relatedStyleAccountId)?.styleNo ?? "整月调整";
        const description = adjustment.reason || adjustment.note || "-";
        return (
          <article className="recon-mini-card recon-adjustment-card" key={adjustment.id}>
            <div className="recon-mini-card-head">
              <div className="recon-adjustment-card-style">
                <span>关联款号</span>
                <strong title={styleNo}>{styleNo}</strong>
              </div>
              <div className="recon-row-actions">
                <button onClick={() => props.onView(adjustment)} title="查看" type="button">
                  <Eye size={15} />
                </button>
                <button onClick={() => props.onDelete(adjustment.id)} title="删除" type="button">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <dl>
              <div>
                <dt>金额</dt>
                <dd className={signedAmount > 0 ? "is-adjustment-positive" : signedAmount < 0 ? "is-adjustment-negative" : ""}>
                  {signedAmount > 0 ? "+" : signedAmount < 0 ? "-" : ""} ¥ {formatMoney(Math.abs(signedAmount))}
                </dd>
              </div>
              <div>
                <dt>说明</dt>
                <dd className="recon-adjustment-card-description" title={description}>{description}</dd>
              </div>
            </dl>
          </article>
        );
      })}
      {props.adjustments.length === 0 && <EmptyPanel text="本月暂无扣款或调整项。" />}
      <div className="recon-adjustment-total">
        <span>调整合计</span>
        <strong className={adjustmentTotal > 0 ? "is-adjustment-positive" : adjustmentTotal < 0 ? "is-adjustment-negative" : ""}>
          {adjustmentTotal > 0 ? "+" : adjustmentTotal < 0 ? "-" : ""} ¥ {formatMoney(Math.abs(adjustmentTotal))}
        </strong>
      </div>
    </div>
  );
}

function PaymentAllocationCards(props: {
  allocations: ReceiptAllocation[];
  onDelete(allocationId: string): void;
  receipts: CustomerReceipt[];
}) {
  return (
    <div className="recon-allocation-card-list">
      {props.allocations.map((allocation) => {
        const receipt = props.receipts.find((item) => item.id === allocation.receiptId);
        return (
          <article className="recon-allocation-card" key={allocation.id}>
            <div className="recon-allocation-card-head">
              <div>
                <span>收款日期</span>
                <strong>{receipt?.receiptDate ?? "-"}</strong>
              </div>
              <button className="recon-icon-button" onClick={() => props.onDelete(allocation.id)} title="删除" type="button">
                <Trash2 size={15} />
              </button>
            </div>
            <dl>
              <div>
                <dt>本次核销金额</dt>
                <dd>¥ {formatMoney(allocation.allocatedAmount)}</dd>
              </div>
              <div>
                <dt>收款方式</dt>
                <dd>{receipt?.method ?? "-"}</dd>
              </div>
              <div>
                <dt>流水号</dt>
                <dd>{receipt?.transactionNo || "-"}</dd>
              </div>
              <div>
                <dt>备注</dt>
                <dd>{allocation.note || "-"}</dd>
              </div>
            </dl>
          </article>
        );
      })}
      {props.allocations.length === 0 && <EmptyPanel text="暂无记录。" />}
    </div>
  );
}

function InvoiceRecordCards(props: { allocations: InvoiceAllocation[]; invoices: CustomerInvoice[]; onDelete(allocationId: string): void }) {
  return (
    <div className="recon-mini-card-list">
      {props.allocations.map((allocation) => {
        const invoice = props.invoices.find((item) => item.id === allocation.invoiceId);
        return (
        <article className="recon-mini-card" key={allocation.id}>
          <div className="recon-mini-card-head">
            <div>
              <span>开票日期</span>
              <strong>{invoice?.invoiceDate ?? "-"}</strong>
            </div>
            <button className="recon-icon-button" onClick={() => props.onDelete(allocation.id)} title="删除开票分配" type="button">
              <Trash2 size={15} />
            </button>
          </div>
          <dl>
            <div>
              <dt>发票号码</dt>
              <dd>{invoice?.invoiceNo || "-"}</dd>
            </div>
            <div>
              <dt>分配金额</dt>
              <dd>¥ {formatMoney(allocation.allocatedAmount)}</dd>
            </div>
            <div>
              <dt>备注</dt>
              <dd>{allocation.note || invoice?.note || "-"}</dd>
            </div>
          </dl>
        </article>
        );
      })}
      {props.allocations.length === 0 && <EmptyPanel text="暂无已分配开票记录。" />}
    </div>
  );
}

function StatementAdjustmentModal(props: {
  onClose(): void;
  onSubmit(adjustment: StatementAdjustment): void;
  statement: MonthlyStatement;
  statementItems: ReturnType<typeof summarizeStatement>["items"];
}) {
  const today = getTodayString();
  const styleOptions = props.statementItems
    .map((item) => ({ id: item.styleAccount?.id ?? item.item.styleAccountId, styleNo: item.styleAccount?.styleNo ?? "-" }))
    .filter((item) => item.id);
  const [direction, setDirection] = useState<AdjustmentDirection>("decrease");
  const [relatedStyleAccountId, setRelatedStyleAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  return (
    <Modal onClose={props.onClose} title="新增扣款">
      <form
        className="recon-form"
        onSubmit={(event) => {
          event.preventDefault();
          const adjustmentAmount = parseMoney(amount);
          if (adjustmentAmount <= 0) {
            window.alert("金额必须大于 0。");
            return;
          }
          props.onSubmit({
            id: createId("adj"),
            customerId: props.statement.customerId,
            statementId: props.statement.id,
            periodMonth: props.statement.periodMonth,
            adjustmentDate: today,
            adjustmentType: direction === "increase" ? "补收" : "其他",
            direction,
            amount: adjustmentAmount,
            relatedStyleAccountId,
            reason: reason.trim(),
            note: note.trim(),
            createdAt: today,
            updatedAt: today,
          });
        }}
      >
        <Field label="调整方向">
          <AnimatedSelect
            ariaLabel="调整方向"
            onChange={(value) => setDirection(value as AdjustmentDirection)}
            options={[
              { label: "扣款 / 调减", value: "decrease" },
              { label: "补收 / 调增", value: "increase" },
            ]}
            value={direction}
          />
        </Field>
        <Field label="关联款号">
          <AnimatedSelect
            ariaLabel="关联款号"
            onChange={setRelatedStyleAccountId}
            options={[{ label: "整月调整", value: "" }, ...styleOptions.map((style) => ({ label: style.styleNo, value: style.id }))]}
            value={relatedStyleAccountId}
          />
        </Field>
        <Field label="金额" required>
          <input min="0" onChange={(event) => setAmount(event.target.value)} step="0.01" type="number" value={amount} />
        </Field>
        <Field label="说明">
          <input onChange={(event) => setReason(event.target.value)} placeholder="例如质量扣款、整月调整" value={reason} />
        </Field>
        <Field label="备注">
          <textarea onChange={(event) => setNote(event.target.value)} value={note} />
        </Field>
        <ModalActions onClose={props.onClose} submitLabel="保存扣款" />
      </form>
    </Modal>
  );
}

function StatementAdjustmentViewModal(props: {
  adjustment: StatementAdjustment;
  onClose(): void;
  onSave(adjustment: StatementAdjustment): void;
  statementItems: ReturnType<typeof summarizeStatement>["items"];
}) {
  const styleOptions = props.statementItems
    .map((item) => ({ id: item.styleAccount?.id ?? item.item.styleAccountId, styleNo: item.styleAccount?.styleNo ?? "-" }))
    .filter((item) => item.id);
  const [isEditing, setIsEditing] = useState(false);
  const [direction, setDirection] = useState<AdjustmentDirection>(props.adjustment.direction);
  const [relatedStyleAccountId, setRelatedStyleAccountId] = useState(props.adjustment.relatedStyleAccountId ?? "");
  const [amount, setAmount] = useState(String(props.adjustment.amount));
  const [reason, setReason] = useState(props.adjustment.reason);
  const [note, setNote] = useState(props.adjustment.note ?? "");
  const signedAmount = getAdjustmentSignedAmount({
    ...props.adjustment,
    amount: parseMoney(amount),
    direction,
    relatedStyleAccountId,
    reason,
    note,
  });
  const styleNo = styleOptions.find((style) => style.id === relatedStyleAccountId)?.styleNo ?? "整月调整";

  function saveAdjustment() {
    const adjustmentAmount = parseMoney(amount);
    if (adjustmentAmount <= 0) {
      window.alert("金额必须大于 0。");
      return;
    }
    props.onSave({
      ...props.adjustment,
      adjustmentType: direction === "increase" ? "补收" : "其他",
      direction,
      relatedStyleAccountId,
      amount: adjustmentAmount,
      reason: reason.trim(),
      note: note.trim(),
      updatedAt: getTodayString(),
    });
    setIsEditing(false);
  }

  return (
    <Modal onClose={props.onClose} title={isEditing ? "编辑扣款" : "查看扣款"}>
      <div className="recon-form">
        {isEditing ? (
          <>
            <Field label="调整方向">
              <AnimatedSelect
                ariaLabel="调整方向"
                onChange={(value) => setDirection(value as AdjustmentDirection)}
                options={[
                  { label: "扣款 / 调减", value: "decrease" },
                  { label: "补收 / 调增", value: "increase" },
                ]}
                value={direction}
              />
            </Field>
            <Field label="关联款号">
              <AnimatedSelect
                ariaLabel="关联款号"
                onChange={setRelatedStyleAccountId}
                options={[{ label: "整月调整", value: "" }, ...styleOptions.map((style) => ({ label: style.styleNo, value: style.id }))]}
                value={relatedStyleAccountId}
              />
            </Field>
            <Field label="金额" required>
              <input min="0" onChange={(event) => setAmount(event.target.value)} step="0.01" type="number" value={amount} />
            </Field>
            <Field label="说明">
              <input onChange={(event) => setReason(event.target.value)} value={reason} />
            </Field>
            <Field label="备注">
              <textarea onChange={(event) => setNote(event.target.value)} value={note} />
            </Field>
          </>
        ) : (
          <table className="recon-detail-info-table">
            <tbody>
              <tr>
                <th>关联款号</th>
                <td>{styleNo}</td>
              </tr>
              <tr>
                <th>金额</th>
                <td className={signedAmount > 0 ? "is-adjustment-positive" : signedAmount < 0 ? "is-adjustment-negative" : ""}>
                  {signedAmount > 0 ? "+" : signedAmount < 0 ? "-" : ""} ¥ {formatMoney(Math.abs(signedAmount))}
                </td>
              </tr>
              <tr>
                <th>说明</th>
                <td>{reason || "-"}</td>
              </tr>
              <tr>
                <th>备注</th>
                <td>{note || "-"}</td>
              </tr>
            </tbody>
          </table>
        )}
        <div className="recon-modal-actions">
          {isEditing ? (
            <>
              <button className="recon-button recon-button-light" onClick={() => setIsEditing(false)} type="button">
                取消
              </button>
              <button className="recon-button recon-button-primary" onClick={saveAdjustment} type="button">
                保存
              </button>
            </>
          ) : (
            <>
              <button className="recon-button recon-button-light" onClick={props.onClose} type="button">
                关闭
              </button>
              <button className="recon-button recon-button-primary" onClick={() => setIsEditing(true)} type="button">
                编辑
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function RecordTable(props: {
  addLabel?: string;
  columns: string[];
  onAdd?(): void;
  rows: Array<Array<string | JSX.Element>>;
}) {
  return (
    <div className="recon-record-card">
      {props.addLabel && props.onAdd && (
        <div className="recon-record-actions">
          <button className="recon-button recon-button-primary" onClick={props.onAdd} type="button">
            <Plus size={16} />
            {props.addLabel}
          </button>
        </div>
      )}
      <table className="recon-table recon-table-compact">
        <thead>
          <tr>
            {props.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {props.rows.length === 0 && <EmptyPanel text="暂无记录。" />}
    </div>
  );
}

function CustomerProfilesModule(props: {
  onDelete(customerId: string): void;
  onImport(rows: CustomerProfileImportRow[], warnings: string[]): void;
  onSave(profile: CustomerProfile): void;
  onSelect(customerId: string): void;
  profiles: CustomerProfile[];
  selectedCustomerId: string;
  store: Parameters<typeof summarizeAll>[1];
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<CustomerType | "">("");
  const [statusFilter, setStatusFilter] = useState<CustomerProfileStatus | "">("");
  const [editingProfile, setEditingProfile] = useState<CustomerProfile>(() =>
    withCustomerProfileDefaults(props.profiles.find((profile) => profile.id === props.selectedCustomerId) ?? createBlankCustomerProfile()),
  );
  const [isNew, setIsNew] = useState(props.profiles.length === 0);
  const [isEditing, setIsEditing] = useState(props.profiles.length === 0);
  const canEdit = isNew || isEditing;

  const visibleProfiles = props.profiles.filter((profile) => {
    const keyword = search.trim().toLowerCase();
    const matchesKeyword =
      !keyword ||
      `${profile.shortName} ${profile.fullName} ${profile.contactName}`.toLowerCase().includes(keyword);
    const matchesType = !typeFilter || profile.customerType === typeFilter;
    const matchesStatus = !statusFilter || profile.status === statusFilter;
    return matchesKeyword && matchesType && matchesStatus;
  });

  function selectProfile(profile: CustomerProfile) {
    setEditingProfile(withCustomerProfileDefaults(profile));
    setIsNew(false);
    setIsEditing(false);
    props.onSelect(profile.id);
  }

  function startNewProfile() {
    setEditingProfile(createBlankCustomerProfile());
    setIsNew(true);
    setIsEditing(true);
  }

  function updateProfile(patch: Partial<CustomerProfile>) {
    if (!canEdit) return;
    setEditingProfile((current) => ({ ...current, ...patch }));
  }

  function saveProfile() {
    if (!editingProfile.shortName.trim() || !editingProfile.fullName.trim()) {
      window.alert("客户简称和客户全称不能为空。");
      return;
    }
    const duplicated = props.profiles.some(
      (profile) =>
        profile.id !== editingProfile.id &&
        (profile.shortName === editingProfile.shortName || profile.fullName === editingProfile.fullName),
    );
    if (duplicated && !window.confirm("存在客户简称或全称相同的客户，是否继续保存？")) return;
    const firstStatementPeriod = props.store.monthlyStatements
      .filter((statement) => statement.customerId === editingProfile.id)
      .sort((left, right) => left.periodMonth.localeCompare(right.periodMonth))[0]?.periodMonth;
    const nextProfile = {
      ...editingProfile,
      shortName: editingProfile.shortName.trim(),
      fullName: editingProfile.fullName.trim(),
      contactName: editingProfile.contactName.trim(),
      startupPeriodMonth: firstStatementPeriod ?? editingProfile.startupPeriodMonth?.trim() ?? "",
      startupOpeningBalance: parseMoney(editingProfile.startupOpeningBalance ?? 0),
    };
    props.onSave(nextProfile);
    setEditingProfile(withCustomerProfileDefaults(nextProfile));
    setIsNew(false);
    setIsEditing(false);
  }

  async function importProfiles(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const result = await readCustomerProfileImportFile(file);
      props.onImport(result.rows, result.warnings);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "客户资料导入失败，请检查 Excel 文件。");
    }
  }

  return (
    <div className="customer-profile-page">
      <section className="customer-profile-filter">
        <label>
          客户名称
          <input onChange={(event) => setSearch(event.target.value)} placeholder="搜索简称、全称、联系人" value={search} />
        </label>
        <label>
          客户类型
          <AnimatedSelect
            ariaLabel="客户类型"
            onChange={(value) => setTypeFilter(value as CustomerType | "")}
            options={[{ label: "全部类型", value: "" }, ...toSelectOptions(customerTypeOptions)]}
            value={typeFilter}
          />
        </label>
        <label>
          状态
          <AnimatedSelect
            ariaLabel="客户资料状态"
            onChange={(value) => setStatusFilter(value as CustomerProfileStatus | "")}
            options={[{ label: "全部状态", value: "" }, ...toSelectOptions(customerProfileStatusOptions)]}
            value={statusFilter}
          />
        </label>
        <button className="recon-button recon-button-primary" onClick={startNewProfile} type="button">
          <UserPlus size={16} />
          新增客户
        </button>
        <a className="recon-button recon-button-light" download href="/templates/客户资料导入模板.xlsx">
          <FileDown size={16} />
          下载模板
        </a>
        <label className="recon-button recon-button-light customer-profile-import-trigger">
          <Upload size={16} />
          导入客户资料
          <input accept=".xlsx,.csv" onChange={importProfiles} type="file" />
        </label>
      </section>

      <section className="customer-profile-body">
        <aside className="customer-profile-list">
          <div className="recon-panel-head">
            <div>
              <span>客户资料</span>
              <strong>{visibleProfiles.length} 个客户</strong>
            </div>
          </div>
          <div className="customer-profile-list__items">
            {visibleProfiles.map((profile) => (
              <button
                className={!isNew && editingProfile.id === profile.id ? "is-selected" : ""}
                key={profile.id}
                onClick={() => selectProfile(profile)}
                type="button"
              >
                <strong>{profile.shortName}</strong>
              </button>
            ))}
          </div>
        </aside>

        <div className="customer-profile-detail">
          <div className="customer-profile-detail__head">
            <div>
              <span>{isNew ? "新增客户资料" : "编辑客户资料"}</span>
              <h2>{editingProfile.shortName || "未命名客户"}</h2>
            </div>
          <div className="recon-topbar-actions">
              <button
                className="recon-button recon-button-primary"
                onClick={canEdit ? saveProfile : () => setIsEditing(true)}
                type="button"
              >
                {canEdit ? "保存" : "编辑"}
              </button>
              <button
                className="recon-button recon-button-light"
                disabled={isNew}
                onClick={() => props.onDelete(editingProfile.id)}
                type="button"
              >
                删除客户
              </button>
            </div>
          </div>

          <fieldset className="customer-profile-edit-fields" disabled={!canEdit}>
            <div className="customer-profile-form">
              <ProfileSection title="基础信息">
                <ProfileInput label="客户简称" onChange={(value) => updateProfile({ shortName: value })} required value={editingProfile.shortName} />
                <ProfileInput label="客户全称" onChange={(value) => updateProfile({ fullName: value })} required value={editingProfile.fullName} />
                <ProfileSelect<CustomerType>
                  label="客户类型"
                  onChange={(value) => updateProfile({ customerType: value })}
                  options={customerTypeOptions}
                  value={editingProfile.customerType}
                />
                <ProfileSelect<CustomerProfileStatus>
                  label="客户状态"
                  onChange={(value) => updateProfile({ status: value })}
                  options={customerProfileStatusOptions}
                  value={editingProfile.status}
                />
                <ProfileTextarea label="备注" onChange={(value) => updateProfile({ note: value })} value={editingProfile.note} />
              </ProfileSection>

              <ProfileSection title="联系人信息">
                <ProfileInput label="联系人" onChange={(value) => updateProfile({ contactName: value })} value={editingProfile.contactName} />
                <ProfileInput label="手机号" onChange={(value) => updateProfile({ mobile: value })} value={editingProfile.mobile} />
                <ProfileInput label="电话" onChange={(value) => updateProfile({ phone: value })} value={editingProfile.phone} />
                <ProfileInput label="微信" onChange={(value) => updateProfile({ wechat: value })} value={editingProfile.wechat} />
                <ProfileInput label="邮箱" onChange={(value) => updateProfile({ email: value })} value={editingProfile.email} />
              </ProfileSection>

              <ProfileSection title="开票信息">
                <ProfileInput label="开票抬头" onChange={(value) => updateProfile({ invoiceTitle: value })} value={editingProfile.invoiceTitle} />
                <ProfileInput label="纳税人识别号" onChange={(value) => updateProfile({ taxNumber: value })} value={editingProfile.taxNumber} />
                <ProfileInput label="开票地址" onChange={(value) => updateProfile({ invoiceAddress: value })} value={editingProfile.invoiceAddress} />
                <ProfileInput label="开票电话" onChange={(value) => updateProfile({ invoicePhone: value })} value={editingProfile.invoicePhone} />
                <ProfileInput label="开户银行" onChange={(value) => updateProfile({ bankName: value })} value={editingProfile.bankName} />
                <ProfileInput label="银行账号" onChange={(value) => updateProfile({ bankAccount: value })} value={editingProfile.bankAccount} />
              </ProfileSection>

              <ProfileSection title="对账信息">
                <ProfileInput label="默认账期" onChange={(value) => updateProfile({ defaultPaymentTerm: value })} value={editingProfile.defaultPaymentTerm} />
                <ProfileInput
                  label="启用账期"
                  onChange={(value) => updateProfile({ startupPeriodMonth: value })}
                  type="month"
                  value={editingProfile.startupPeriodMonth ?? ""}
                />
                <ProfileInput
                  label="启用期初余额"
                  onChange={(value) => updateProfile({ startupOpeningBalance: parseMoney(value) })}
                  step="0.01"
                  type="number"
                  value={editingProfile.startupOpeningBalance ?? 0}
                />
                <ProfileInput label="默认对账日" onChange={(value) => updateProfile({ statementDay: value })} value={editingProfile.statementDay} />
                <ProfileInput label="默认付款日" onChange={(value) => updateProfile({ paymentDay: value })} value={editingProfile.paymentDay} />
                <ProfileInput label="币种" onChange={(value) => updateProfile({ currency: value })} value={editingProfile.currency} />
                <label className="customer-profile-toggle">
                  <span>是否需要发票后付款</span>
                  <AnimatedSelect
                    ariaLabel="是否需要发票后付款"
                    onChange={(value) => updateProfile({ needInvoiceBeforePayment: value === "true" })}
                    options={[
                      { label: "否", value: "false" },
                      { label: "是", value: "true" },
                    ]}
                    value={String(editingProfile.needInvoiceBeforePayment)}
                  />
                </label>
              </ProfileSection>

              <ProfileSection title="结算规则">
                <label className="customer-profile-toggle">
                  <span>结算方式</span>
                  <AnimatedSelect
                    ariaLabel="结算方式"
                    onChange={(value) => updateProfile({ settlementType: value as SettlementType })}
                    options={toSelectOptions(settlementTypeOptions)}
                    value={editingProfile.settlementType ?? "月结"}
                  />
                </label>
                <ProfileInput
                  label="账期天数"
                  min="0"
                  onChange={(value) => updateProfile({ paymentTermDays: value.trim() === "" ? undefined : Math.max(0, Math.round(Number(value) || 0)) })}
                  placeholder="例如 30，留空则不自动计算到期日"
                  step="1"
                  type="number"
                  value={editingProfile.paymentTermDays ?? ""}
                />
                <ProfileInput
                  label="信用额度"
                  min="0"
                  onChange={(value) => updateProfile({ creditLimit: value.trim() === "" ? undefined : parseMoney(value) })}
                  step="0.01"
                  type="number"
                  value={editingProfile.creditLimit ?? ""}
                />
              </ProfileSection>

              <ProfileSection title="地址信息">
                <ProfileTextarea label="收货地址" onChange={(value) => updateProfile({ shippingAddress: value })} value={editingProfile.shippingAddress} />
                <ProfileTextarea label="寄票地址" onChange={(value) => updateProfile({ invoiceMailingAddress: value })} value={editingProfile.invoiceMailingAddress} />
              </ProfileSection>
            </div>
          </fieldset>
        </div>
      </section>
    </div>
  );
}

function createBlankCustomerProfile(): CustomerProfile {
  const today = getTodayString();
  return {
    id: createId("cust"),
    shortName: "",
    fullName: "",
    customerType: "其他",
    status: "正常",
    contactName: "",
    mobile: "",
    phone: "",
    wechat: "",
    email: "",
    invoiceTitle: "",
    taxNumber: "",
    invoiceAddress: "",
    invoicePhone: "",
    bankName: "",
    bankAccount: "",
    startupPeriodMonth: "",
    startupOpeningBalance: 0,
    defaultPaymentTerm: "月结",
    statementDay: "每月25日",
    paymentDay: "次月10日",
    currency: "人民币",
    needInvoiceBeforePayment: false,
    shippingAddress: "",
    invoiceMailingAddress: "",
    note: "",
    createdAt: today,
    updatedAt: today,
  };
}

function withCustomerProfileDefaults(profile: CustomerProfile): CustomerProfile {
  return {
    ...profile,
    startupPeriodMonth: profile.startupPeriodMonth ?? "",
    startupOpeningBalance: typeof profile.startupOpeningBalance === "number" ? profile.startupOpeningBalance : 0,
  };
}

function ProfileSection(props: { children: JSX.Element | JSX.Element[]; title: string }) {
  return (
    <section className="customer-profile-section">
      <h3>{props.title}</h3>
      <div className="customer-profile-grid">{props.children}</div>
    </section>
  );
}

function ProfileInput(props: {
  label: string;
  min?: string;
  onChange(value: string): void;
  placeholder?: string;
  required?: boolean;
  step?: string;
  type?: string;
  value: string | number;
}) {
  return (
    <label className="customer-profile-field">
      <span>
        {props.label}
        {props.required && <em>*</em>}
      </span>
      <input
        min={props.min}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        step={props.step}
        type={props.type ?? "text"}
        value={props.value}
      />
    </label>
  );
}

function ProfileTextarea(props: { label: string; onChange(value: string): void; value: string }) {
  return (
    <label className="customer-profile-field customer-profile-field-wide">
      <span>{props.label}</span>
      <textarea onChange={(event) => props.onChange(event.target.value)} value={props.value} />
    </label>
  );
}

function ProfileSelect<TValue extends string>(props: {
  label: string;
  onChange(value: TValue): void;
  options: TValue[];
  value: TValue;
}) {
  return (
    <label className="customer-profile-field">
      <span>{props.label}</span>
      <AnimatedSelect
        ariaLabel={props.label}
        onChange={(value) => props.onChange(value as TValue)}
        options={toSelectOptions(props.options)}
        value={props.value}
      />
    </label>
  );
}

function formatPeriodLabel(period: string) {
  const [year, month] = period.split("-");
  if (!month) return period;
  return `${year}年${Number(month)}月`;
}

type SpreadsheetGridColumn<TColumnId extends string> = {
  filterable?: boolean;
  id: TColumnId;
  label: string;
  minWidth: number;
  width: string;
};

type SpreadsheetGridRow<TColumnId extends string> = {
  values: Record<TColumnId, string>;
};

function loadSpreadsheetGridColumnWidths(storageKey: string, expectedLength: number): number[] | null {
  try {
    const rawWidths = window.localStorage.getItem(storageKey);
    if (!rawWidths) return null;
    const widths = JSON.parse(rawWidths);
    if (!Array.isArray(widths) || widths.length !== expectedLength) return null;
    if (!widths.every((width) => typeof width === "number" && Number.isFinite(width) && width >= 72 && width <= 960)) return null;
    return widths;
  } catch {
    return null;
  }
}

function createSpreadsheetColumnQueries<TColumnId extends string>(columns: readonly SpreadsheetGridColumn<TColumnId>[]): Record<TColumnId, string> {
  return columns.reduce<Record<TColumnId, string>>((queries, column) => {
    queries[column.id] = "";
    return queries;
  }, {} as Record<TColumnId, string>);
}

function getSpreadsheetColumnValues<TColumnId extends string>(
  columns: readonly SpreadsheetGridColumn<TColumnId>[],
  rows: readonly SpreadsheetGridRow<TColumnId>[],
): Record<TColumnId, string[]> {
  return columns.reduce<Record<TColumnId, string[]>>((valuesByColumn, column) => {
    valuesByColumn[column.id] = Array.from(new Set(rows.map((row) => row.values[column.id]))).sort((left, right) => left.localeCompare(right, "zh-CN"));
    return valuesByColumn;
  }, {} as Record<TColumnId, string[]>);
}

function beginSpreadsheetColumnResize(
  table: HTMLTableElement | null,
  storedWidths: number[] | null,
  minimumWidths: number[],
  columnIndex: number,
  event: ReactPointerEvent<HTMLButtonElement>,
  setWidths: (widths: number[]) => void,
) {
  event.preventDefault();
  event.stopPropagation();
  if (!table) return;

  const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead tr:first-child th"));
  const initialWidths = storedWidths ?? headers.map((header) => header.getBoundingClientRect().width);
  const startX = event.clientX;
  const scrollContainer = table.parentElement;
  const initialScrollLeft = scrollContainer?.scrollLeft ?? 0;
  const handlePointerMove = (moveEvent: PointerEvent) => {
    const nextWidths = [...initialWidths];
    nextWidths[columnIndex] = Math.max(minimumWidths[columnIndex], initialWidths[columnIndex] + moveEvent.clientX - startX);
    setWidths(nextWidths);
    window.requestAnimationFrame(() => {
      if (scrollContainer) scrollContainer.scrollLeft = initialScrollLeft;
    });
  };
  const stopResize = () => {
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", stopResize);
    document.body.classList.remove("is-column-resizing");
  };

  document.body.classList.add("is-column-resizing");
  document.addEventListener("pointermove", handlePointerMove);
  document.addEventListener("pointerup", stopResize, { once: true });
}

function SpreadsheetGridHeader<TColumnId extends string>(props: {
  activeFilterColumn: TColumnId | null;
  columnQueries: Record<TColumnId, string>;
  columnSelections: Partial<Record<TColumnId, string[]>>;
  columnValues: Record<TColumnId, string[]>;
  columns: readonly SpreadsheetGridColumn<TColumnId>[];
  filterPopoverRef: { current: HTMLDivElement | null };
  filterValueSearch: string;
  onBeginResize(columnIndex: number, event: ReactPointerEvent<HTMLButtonElement>): void;
  onClearColumnFilter(columnId: TColumnId): void;
  onColumnQueryChange(columnId: TColumnId, value: string): void;
  onColumnSelectionChange(columnId: TColumnId, values: string[]): void;
  onFilterValueSearchChange(value: string): void;
  onToggleColumnFilter(columnId: TColumnId): void;
  onToggleColumnValue(columnId: TColumnId, value: string): void;
}) {
  return (
    <thead>
      <tr className="receipt-grid-header-row">
        {props.columns.map((column, index) => {
          const isFilterable = column.filterable !== false;
          const values = props.columnValues[column.id];
          const selectedValues = props.columnSelections[column.id] ?? values;
          const isFiltered = isFilterable && Boolean(props.columnQueries[column.id] || (props.columnSelections[column.id] && selectedValues.length !== values.length));
          const visibleValues = values.filter((value) => value.toLowerCase().includes(props.filterValueSearch.trim().toLowerCase()));
          return (
            <th key={column.id}>
              <div className="receipt-grid-header-content" ref={isFilterable && props.activeFilterColumn === column.id ? props.filterPopoverRef : undefined}>
                <span>{column.label}</span>
                {isFilterable && (
                  <button
                    aria-label={`筛选${column.label}`}
                    className={`receipt-grid-filter-button ${isFiltered ? "is-active" : ""}`}
                    onClick={() => props.onToggleColumnFilter(column.id)}
                    title={`筛选${column.label}`}
                    type="button"
                  >
                    <Filter size={14} />
                  </button>
                )}
                {isFilterable && props.activeFilterColumn === column.id && (
                  <div className="receipt-grid-filter-popover" role="dialog" aria-label={`筛选${column.label}`}>
                    <div className="receipt-grid-filter-popover__head">
                      <strong>{column.label}筛选</strong>
                      <button onClick={() => props.onClearColumnFilter(column.id)} type="button">清除</button>
                    </div>
                    <input
                      aria-label={`搜索${column.label}筛选值`}
                      autoFocus
                      onChange={(event) => props.onFilterValueSearchChange(event.target.value)}
                      placeholder="搜索筛选值"
                      value={props.filterValueSearch}
                    />
                    <label className="receipt-grid-filter-check receipt-grid-filter-check-all">
                      <input
                        checked={selectedValues.length === values.length}
                        onChange={(event) => props.onColumnSelectionChange(column.id, event.target.checked ? values : [])}
                        type="checkbox"
                      />
                      全部
                    </label>
                    <div className="receipt-grid-filter-values">
                      {visibleValues.map((value) => (
                        <label className="receipt-grid-filter-check" key={value}>
                          <input checked={selectedValues.includes(value)} onChange={() => props.onToggleColumnValue(column.id, value)} type="checkbox" />
                          <span title={value}>{value}</span>
                        </label>
                      ))}
                      {visibleValues.length === 0 && <span className="receipt-grid-filter-empty">没有匹配项</span>}
                    </div>
                  </div>
                )}
              </div>
              {index < props.columns.length - 1 && (
                <button
                  aria-label={`调整${column.label}列宽`}
                  className="recon-column-resizer"
                  onPointerDown={(event) => props.onBeginResize(index, event)}
                  title="拖动调整列宽"
                  type="button"
                />
              )}
            </th>
          );
        })}
      </tr>
      <tr className="receipt-grid-filter-row">
        {props.columns.map((column) =>
          column.filterable === false ? (
            <th key={column.id} />
          ) : (
            <th key={column.id}>
              <input
                aria-label={`快速筛选${column.label}`}
                onChange={(event) => props.onColumnQueryChange(column.id, event.target.value)}
                placeholder="筛选"
                value={props.columnQueries[column.id]}
              />
            </th>
          ),
        )}
      </tr>
    </thead>
  );
}

type OverviewGridColumnId =
  | "customer"
  | "periodMonth"
  | "status"
  | "styleCount"
  | "receivable"
  | "invoiced"
  | "received"
  | "closingBalance"
  | "dueDate"
  | "overdueDays"
  | "aging";

const overviewGridColumns: Array<SpreadsheetGridColumn<OverviewGridColumnId>> = [
  { id: "customer", label: "客户", minWidth: 160, width: "15%" },
  { id: "periodMonth", label: "对账月份", minWidth: 118, width: "9%" },
  { id: "status", label: "状态", minWidth: 100, width: "7%" },
  { id: "styleCount", label: "款号数量", minWidth: 100, width: "8%" },
  { id: "receivable", label: "本月应收", minWidth: 140, width: "12%" },
  { id: "invoiced", label: "已开票", minWidth: 130, width: "11%" },
  { id: "received", label: "已收款", minWidth: 130, width: "11%" },
  { id: "closingBalance", label: "期末余额", minWidth: 140, width: "12%" },
  { id: "dueDate", label: "到期日", minWidth: 118, width: "9%" },
  { id: "overdueDays", label: "逾期天数", minWidth: 100, width: "8%" },
  { id: "aging", label: "账龄", minWidth: 110, width: "8%" },
];

type InvoiceGridColumnId = "customer" | "styleNos" | "invoiceDate" | "invoiceNo" | "amount" | "note";

const invoiceGridColumns: Array<SpreadsheetGridColumn<InvoiceGridColumnId>> = [
  { id: "customer", label: "客户", minWidth: 155, width: "17%" },
  { id: "styleNos", label: "款号", minWidth: 175, width: "19%" },
  { id: "invoiceDate", label: "开票日期", minWidth: 140, width: "15%" },
  { id: "invoiceNo", label: "发票号码", minWidth: 175, width: "19%" },
  { id: "amount", label: "开票金额", minWidth: 145, width: "16%" },
  { id: "note", label: "备注", minWidth: 170, width: "14%" },
];

type FinancialGridColumnId =
  | "date"
  | "customer"
  | "documentNo"
  | "method"
  | "receiptAmount"
  | "receiptAllocated"
  | "receiptUnallocated"
  | "settlementStatus"
  | "invoiceAmount"
  | "note"
  | "actions";

type FinancialGridRow = SpreadsheetGridRow<FinancialGridColumnId> & {
  customerId: string;
  date: string;
  invoice?: CustomerInvoice;
  receipt?: CustomerReceipt;
  type: "invoice" | "receipt";
};

const financialGridColumns: Array<SpreadsheetGridColumn<FinancialGridColumnId>> = [
  { id: "date", label: "日期", minWidth: 118, width: "9%" },
  { id: "customer", label: "客户", minWidth: 148, width: "11%" },
  { id: "documentNo", label: "单据编号", minWidth: 156, width: "12%" },
  { id: "method", label: "收款方式", minWidth: 118, width: "9%" },
  { id: "receiptAmount", label: "收款金额", minWidth: 132, width: "10%" },
  { id: "receiptAllocated", label: "已核销", minWidth: 122, width: "9%" },
  { id: "receiptUnallocated", label: "未核销", minWidth: 122, width: "9%" },
  { id: "settlementStatus", label: "核销状态", minWidth: 118, width: "9%" },
  { id: "invoiceAmount", label: "开票金额", minWidth: 132, width: "10%" },
  { id: "note", label: "备注", minWidth: 150, width: "8%" },
  { filterable: false, id: "actions", label: "操作", minWidth: 104, width: "4%" },
];

type StyleGridColumnId = "styleNo" | "receivable" | "invoiced" | "received" | "adjustment" | "unpaid" | "status" | "actions";

const styleGridColumns: Array<SpreadsheetGridColumn<StyleGridColumnId>> = [
  { id: "styleNo", label: "款号", minWidth: 150, width: "15%" },
  { id: "receivable", label: "应收金额", minWidth: 140, width: "14%" },
  { id: "invoiced", label: "已开票金额", minWidth: 136, width: "13%" },
  { id: "received", label: "已收款金额", minWidth: 136, width: "13%" },
  { id: "adjustment", label: "调整", minWidth: 112, width: "10%" },
  { id: "unpaid", label: "未收金额", minWidth: 136, width: "13%" },
  { id: "status", label: "对账状态", minWidth: 172, width: "14%" },
  { id: "actions", label: "操作", minWidth: 118, width: "8%" },
];

const OVERVIEW_GRID_COLUMN_WIDTHS_STORAGE_KEY = "zhenlin-reconciliation.overview-grid-widths.v1";
const INVOICE_GRID_COLUMN_WIDTHS_STORAGE_KEY = "zhenlin-reconciliation.invoice-grid-widths.v1";
const FINANCIAL_GRID_COLUMN_WIDTHS_STORAGE_KEY = "zhenlin-reconciliation.financial-grid-widths.v1";
const STYLE_GRID_COLUMN_WIDTHS_STORAGE_KEY = "zhenlin-reconciliation.style-grid-widths.v1";

function OverviewModule(props: { customers: Customer[]; store: Parameters<typeof summarizeAll>[1]; summary: ReturnType<typeof summarizeAll> }) {
  const [customerId, setCustomerId] = useState("");
  const [showAgingAnalysis, setShowAgingAnalysis] = useState(false);
  const periodRange = getAvailablePeriods(props.store);
  const [periodFrom, setPeriodFrom] = useState(periodRange[periodRange.length - 1] ?? "");
  const [periodTo, setPeriodTo] = useState(periodRange[0] ?? "");
  const [status, setStatus] = useState<StatementStatus | "">("");
  const [columnQueries, setColumnQueries] = useState<Record<OverviewGridColumnId, string>>(() => createSpreadsheetColumnQueries(overviewGridColumns));
  const [columnSelections, setColumnSelections] = useState<Partial<Record<OverviewGridColumnId, string[]>>>({});
  const [activeFilterColumn, setActiveFilterColumn] = useState<OverviewGridColumnId | null>(null);
  const [filterValueSearch, setFilterValueSearch] = useState("");
  const [overviewColumnWidths, setOverviewColumnWidths] = useState<number[] | null>(() =>
    loadSpreadsheetGridColumnWidths(OVERVIEW_GRID_COLUMN_WIDTHS_STORAGE_KEY, overviewGridColumns.length),
  );
  const overviewTableRef = useRef<HTMLTableElement | null>(null);
  const overviewFilterPopoverRef = useRef<HTMLDivElement | null>(null);
  const periodOptions = getAvailablePeriods(props.store);
  const orderedPeriods = [...periodOptions].sort();
  const effectiveFrom = periodFrom || orderedPeriods[0] || "";
  const effectiveTo = periodTo || orderedPeriods[orderedPeriods.length - 1] || "";
  const statementSummaries = props.store.monthlyStatements
    .map((statement) => summarizeStatement(statement, props.store))
    .filter((summary) => {
      const matchesCustomer = !customerId || summary.statement.customerId === customerId;
      const matchesPeriod =
        (!effectiveFrom || summary.statement.periodMonth >= effectiveFrom) &&
        (!effectiveTo || summary.statement.periodMonth <= effectiveTo);
      const matchesStatus = !status || summary.status === status;
      return matchesCustomer && matchesPeriod && matchesStatus;
    });
  const filteredSummary = {
    receivableTotal: sumMoney(statementSummaries.map((item) => item.currentReceivable)),
    invoicedTotal: sumMoney(statementSummaries.map((item) => item.currentInvoiced)),
    paidTotal: sumMoney(statementSummaries.map((item) => item.currentReceived)),
    unpaidAmount: sumMoney(statementSummaries.map((item) => item.closingBalance)),
  };
  const overviewRows: Array<SpreadsheetGridRow<OverviewGridColumnId> & { summary: (typeof statementSummaries)[number]; dueInfo: ReturnType<typeof getStatementDueInfo> }> = statementSummaries.map((summary) => {
    const dueInfo = getStatementDueInfo(summary.statement, props.store);
    return {
      summary,
      dueInfo,
      values: {
        customer: getCustomerDisplayName(summary.statement.customerId, props.store),
        periodMonth: summary.statement.periodMonth,
        status: summary.status,
        styleCount: String(summary.items.length),
        receivable: formatMoney(summary.currentReceivable),
        invoiced: formatMoney(summary.currentInvoiced),
        received: formatMoney(summary.currentReceived),
        closingBalance: formatMoney(summary.closingBalance),
        dueDate: dueInfo.dueDate || "-",
        overdueDays: dueInfo.dueStatus === "overdue" ? `逾期${dueInfo.overdueDays}天` : dueInfo.dueStatusLabel,
        aging: dueInfo.agingLabel,
      },
    };
  });
  const overviewColumnValues = getSpreadsheetColumnValues(overviewGridColumns, overviewRows);
  const visibleOverviewRows = overviewRows.filter((row) =>
    overviewGridColumns.every((column) => {
      const query = columnQueries[column.id].trim().toLowerCase();
      const selection = columnSelections[column.id];
      const value = row.values[column.id];
      return (!query || value.toLowerCase().includes(query)) && (!selection || selection.includes(value));
    }),
  );
  const visibleOverviewSummary = {
    receivableTotal: sumMoney(visibleOverviewRows.map((row) => row.summary.currentReceivable)),
    invoicedTotal: sumMoney(visibleOverviewRows.map((row) => row.summary.currentInvoiced)),
    paidTotal: sumMoney(visibleOverviewRows.map((row) => row.summary.currentReceived)),
    unpaidAmount: sumMoney(visibleOverviewRows.map((row) => row.summary.closingBalance)),
  };
  const dueTotals = statementSummaries.reduce(
    (totals, summary) => {
      const dueInfo = getStatementDueInfo(summary.statement, props.store);
      if (dueInfo.dueStatus === "overdue") {
        totals.overdue = roundMoney(totals.overdue + dueInfo.remainingReceivable);
        if (dueInfo.agingBucket === "days_91_180" || dueInfo.agingBucket === "days_180_plus") {
          totals.over90 = roundMoney(totals.over90 + dueInfo.remainingReceivable);
        }
      } else {
        totals.notDue = roundMoney(totals.notDue + dueInfo.remainingReceivable);
      }
      return totals;
    },
    { overdue: 0, over90: 0, notDue: 0 },
  );
  const agingSummary = getAgingBucketsSummary(statementSummaries, props.store);
  const agingDetails = statementSummaries
    .map((summary) => ({ summary, dueInfo: getStatementDueInfo(summary.statement, props.store) }))
    .filter(({ dueInfo }) => dueInfo.remainingReceivable > 0)
    .sort((left, right) => right.dueInfo.overdueDays - left.dueInfo.overdueDays);
  const overviewTableWidth = overviewColumnWidths?.reduce((sum, width) => sum + width, 0) ?? 1170;

  useEffect(() => {
    if (!activeFilterColumn) return;
    const closeFilterPopover = (event: MouseEvent) => {
      if (!overviewFilterPopoverRef.current?.contains(event.target as Node)) setActiveFilterColumn(null);
    };
    document.addEventListener("mousedown", closeFilterPopover);
    return () => document.removeEventListener("mousedown", closeFilterPopover);
  }, [activeFilterColumn]);

  useEffect(() => {
    if (!overviewColumnWidths) return;
    try {
      window.localStorage.setItem(OVERVIEW_GRID_COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(overviewColumnWidths));
    } catch {
      // 列宽记录失败不影响对账总览使用。
    }
  }, [overviewColumnWidths]);

  function setOverviewColumnQuery(columnId: OverviewGridColumnId, value: string) {
    setColumnQueries((current) => ({ ...current, [columnId]: value }));
  }

  function setOverviewColumnSelection(columnId: OverviewGridColumnId, values: string[]) {
    setColumnSelections((current) => ({ ...current, [columnId]: values }));
  }

  function toggleOverviewColumnValue(columnId: OverviewGridColumnId, value: string) {
    const allValues = overviewColumnValues[columnId];
    setColumnSelections((current) => {
      const selectedValues = new Set(current[columnId] ?? allValues);
      if (selectedValues.has(value)) selectedValues.delete(value);
      else selectedValues.add(value);
      return { ...current, [columnId]: Array.from(selectedValues) };
    });
  }

  function clearOverviewColumnFilter(columnId: OverviewGridColumnId) {
    setOverviewColumnQuery(columnId, "");
    setColumnSelections((current) => {
      const { [columnId]: _discarded, ...remaining } = current;
      return remaining;
    });
    setFilterValueSearch("");
  }
  return (
    <div className="recon-workspace">
      <section className="recon-stat-grid">
        <StatCard label="应收总额" value={filteredSummary.receivableTotal} icon={Banknote} />
        <StatCard label="未收余额" value={filteredSummary.unpaidAmount} icon={BarChart3} tone="warning" />
        <StatCard label="逾期应收" value={dueTotals.overdue} icon={AlertTriangle} tone="warning" />
        <StatCard label="90天以上应收" value={dueTotals.over90} icon={ReceiptText} tone="warning" />
      </section>
      <section className="recon-simple-panel records-fill-page overview-records-page">
        <div className="recon-panel-head overview-records-head">
          <div className="module-filter-grid module-filter-grid-wide overview-records-filter-grid">
            <label>
              客户
              <SearchableSelect
                ariaLabel="客户"
                emptyText="无匹配客户"
                onChange={setCustomerId}
                options={[{ label: "全部客户", value: "" }, ...props.customers.map((customer) => ({ label: customer.name, value: customer.id }))]}
                placeholder="全部客户"
                value={customerId}
              />
            </label>
            <label>
              对账月份
              <div className="module-filter-range">
                <AnimatedSelect
                  ariaLabel="起始月份"
                  onChange={(value) => {
                    setPeriodFrom(value);
                    if (effectiveTo && value > effectiveTo) setPeriodTo(value);
                  }}
                  options={orderedPeriods.map((period) => ({ label: formatPeriodLabel(period), value: period }))}
                  value={effectiveFrom}
                />
                <span className="module-filter-range-sep">至</span>
                <AnimatedSelect
                  ariaLabel="截止月份"
                  onChange={(value) => {
                    setPeriodTo(value);
                    if (effectiveFrom && value < effectiveFrom) setPeriodFrom(value);
                  }}
                  options={orderedPeriods.map((period) => ({ label: formatPeriodLabel(period), value: period }))}
                  value={effectiveTo}
                />
              </div>
            </label>
            <label>
              状态
              <AnimatedSelect
                ariaLabel="状态"
                onChange={(value) => setStatus(value as StatementStatus | "")}
                options={[{ label: "全部状态", value: "" }, ...toSelectOptions(statementStatusOptions)]}
                value={status}
              />
            </label>
            <button
              className="recon-button recon-button-light"
              onClick={() => {
                setCustomerId("");
                setPeriodFrom(orderedPeriods[0] ?? "");
                setPeriodTo(orderedPeriods[orderedPeriods.length - 1] ?? "");
                setStatus("");
                setColumnQueries(createSpreadsheetColumnQueries(overviewGridColumns));
                setColumnSelections({});
                setActiveFilterColumn(null);
              }}
              type="button"
            >
              重置
            </button>
            <button className="recon-button recon-button-primary" onClick={() => setShowAgingAnalysis(true)} type="button">
              <BarChart3 size={16} />
              账龄分析
            </button>
          </div>
        </div>
        <div className="receipt-grid-scroll overview-grid-scroll">
          <table
            className="recon-table recon-table-stable receipt-grid-table overview-grid-table"
            ref={overviewTableRef}
            style={{ minWidth: "100%", width: overviewColumnWidths ? `${overviewTableWidth}px` : "100%" }}
          >
            <colgroup>
              {overviewGridColumns.map((column, index) => (
                <col key={column.id} style={{ width: overviewColumnWidths ? `${overviewColumnWidths[index]}px` : column.width }} />
              ))}
            </colgroup>
            <SpreadsheetGridHeader
              activeFilterColumn={activeFilterColumn}
              columnQueries={columnQueries}
              columnSelections={columnSelections}
              columnValues={overviewColumnValues}
              columns={overviewGridColumns}
              filterPopoverRef={overviewFilterPopoverRef}
              filterValueSearch={filterValueSearch}
              onBeginResize={(columnIndex, event) =>
                beginSpreadsheetColumnResize(
                  overviewTableRef.current,
                  overviewColumnWidths,
                  overviewGridColumns.map((column) => column.minWidth),
                  columnIndex,
                  event,
                  setOverviewColumnWidths,
                )
              }
              onClearColumnFilter={clearOverviewColumnFilter}
              onColumnQueryChange={setOverviewColumnQuery}
              onColumnSelectionChange={setOverviewColumnSelection}
              onFilterValueSearchChange={setFilterValueSearch}
              onToggleColumnFilter={(columnId) => {
                setActiveFilterColumn((current) => (current === columnId ? null : columnId));
                setFilterValueSearch("");
              }}
              onToggleColumnValue={toggleOverviewColumnValue}
            />
            <tbody>
              {visibleOverviewRows.map(({ summary, dueInfo }) => (
                <tr key={summary.statement.id}>
                  <td>{getCustomerDisplayName(summary.statement.customerId, props.store)}</td>
                  <td>{summary.statement.periodMonth}</td>
                  <td>{summary.status}</td>
                  <td>{summary.items.length}</td>
                  <td>¥ {formatMoney(summary.currentReceivable)}</td>
                  <td>¥ {formatMoney(summary.currentInvoiced)}</td>
                  <td>¥ {formatMoney(summary.currentReceived)}</td>
                  <td className={summary.closingBalance > 0 ? "is-danger" : "is-ok"}>¥ {formatMoney(summary.closingBalance)}</td>
                  <td>{dueInfo.dueDate || "-"}</td>
                  <td className={dueInfo.dueStatus === "overdue" ? "is-danger" : ""}>
                    {dueInfo.dueStatus === "overdue" ? `逾期${dueInfo.overdueDays}天` : dueInfo.dueStatusLabel}
                  </td>
                  <td>{dueInfo.agingLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="receipt-grid-summary overview-grid-summary" aria-label="当前对账合计">
          <strong>当前合计</strong>
          <div>
            <span>本月应收 <b>¥ {formatMoney(visibleOverviewSummary.receivableTotal)}</b></span>
            <span>已开票 <b>¥ {formatMoney(visibleOverviewSummary.invoicedTotal)}</b></span>
            <span>已收款 <b>¥ {formatMoney(visibleOverviewSummary.paidTotal)}</b></span>
            <span className={visibleOverviewSummary.unpaidAmount > 0 ? "is-danger" : "is-ok"}>期末余额 <b>¥ {formatMoney(visibleOverviewSummary.unpaidAmount)}</b></span>
          </div>
        </footer>
      </section>
      {showAgingAnalysis && (
        <Modal onClose={() => setShowAgingAnalysis(false)} size="receiptPool" title="账龄分析">
          <>
            <div className="aging-summary-grid">
              {agingBuckets.map((bucket) => (
                <div className={`aging-summary-item ${bucket === "days_91_180" || bucket === "days_180_plus" ? "is-danger" : ""}`} key={bucket}>
                  <span>{agingBucketLabels[bucket]}</span>
                  <strong>¥ {formatMoney(agingSummary[bucket])}</strong>
                </div>
              ))}
            </div>
            <div className="recon-table-wrap">
              <table className="recon-table recon-table-stable">
                <colgroup>
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "18%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>客户</th>
                    <th>对账月份</th>
                    <th>未收金额</th>
                    <th>到期日</th>
                    <th>逾期天数</th>
                    <th>账龄</th>
                    <th>对账状态</th>
                  </tr>
                </thead>
                <tbody>
                  {agingDetails.length === 0 ? (
                    <tr>
                      <td colSpan={7}>当前筛选范围内没有未收账款。</td>
                    </tr>
                  ) : (
                    agingDetails.map(({ summary, dueInfo }) => (
                      <tr key={summary.statement.id}>
                        <td>{getCustomerDisplayName(summary.statement.customerId, props.store)}</td>
                        <td>{summary.statement.periodMonth}</td>
                        <td className="is-danger">¥ {formatMoney(dueInfo.remainingReceivable)}</td>
                        <td>{dueInfo.dueDate || "-"}</td>
                        <td className={dueInfo.dueStatus === "overdue" ? "is-danger" : ""}>
                          {dueInfo.dueStatus === "overdue" ? `${dueInfo.overdueDays} 天` : "-"}
                        </td>
                        <td>{dueInfo.agingLabel}</td>
                        <td>{summary.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        </Modal>
      )}
    </div>
  );
}

type ReceiptGridColumnId =
  | "customer"
  | "receiptDate"
  | "amount"
  | "allocated"
  | "unallocated"
  | "method"
  | "transactionNo"
  | "note"
  | "actions";

type ReceiptGridFilterColumnId = Exclude<ReceiptGridColumnId, "actions">;

type ReceiptGridRow = {
  allocated: number;
  receipt: CustomerReceipt;
  unallocated: number;
  values: Record<ReceiptGridFilterColumnId, string>;
};

const receiptGridColumns: Array<{ id: ReceiptGridColumnId; label: string; width: string }> = [
  { id: "customer", label: "客户", width: "12%" },
  { id: "receiptDate", label: "收款日期", width: "12%" },
  { id: "amount", label: "收款金额", width: "14%" },
  { id: "allocated", label: "已分配", width: "12%" },
  { id: "unallocated", label: "未分配", width: "12%" },
  { id: "method", label: "收款方式", width: "10%" },
  { id: "transactionNo", label: "流水号", width: "12%" },
  { id: "note", label: "备注", width: "9%" },
  { id: "actions", label: "操作", width: "7%" },
];

const RECEIPT_GRID_COLUMN_WIDTHS_STORAGE_KEY = "zhenlin-reconciliation.receipt-grid-widths.v1";

function loadReceiptGridColumnWidths(): number[] | null {
  try {
    const rawWidths = window.localStorage.getItem(RECEIPT_GRID_COLUMN_WIDTHS_STORAGE_KEY);
    if (!rawWidths) return null;
    const widths = JSON.parse(rawWidths);
    if (!Array.isArray(widths) || widths.length !== receiptGridColumns.length) return null;
    if (!widths.every((width) => typeof width === "number" && Number.isFinite(width) && width >= 72 && width <= 960)) return null;
    return widths;
  } catch {
    return null;
  }
}

const receiptGridFilterColumns = receiptGridColumns.filter(
  (column): column is { id: ReceiptGridFilterColumnId; label: string; width: string } => column.id !== "actions",
);

function createEmptyReceiptColumnQueries(): Record<ReceiptGridFilterColumnId, string> {
  return {
    customer: "",
    receiptDate: "",
    amount: "",
    allocated: "",
    unallocated: "",
    method: "",
    transactionNo: "",
    note: "",
  };
}

function ReceiptPoolModule(props: {
  allocations: ReceiptAllocation[];
  customerProfiles: CustomerProfile[];
  customers: Customer[];
  onAllocate(customerId: string): void;
  onDeleteReceipt(receiptId: string): void;
  onImport(rows: ReceiptImportRow[], warnings: string[]): void;
  onSaveReceipt(receipt: CustomerReceipt): void;
  receipts: CustomerReceipt[];
}) {
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [keyword, setKeyword] = useState("");
  const [editingReceipt, setEditingReceipt] = useState<CustomerReceipt | null>(null);
  const [pendingDeleteReceipt, setPendingDeleteReceipt] = useState<CustomerReceipt | null>(null);
  const [columnQueries, setColumnQueries] = useState<Record<ReceiptGridFilterColumnId, string>>(createEmptyReceiptColumnQueries);
  const [columnSelections, setColumnSelections] = useState<Partial<Record<ReceiptGridFilterColumnId, string[]>>>({});
  const [activeFilterColumn, setActiveFilterColumn] = useState<ReceiptGridFilterColumnId | null>(null);
  const [filterValueSearch, setFilterValueSearch] = useState("");
  const [receiptColumnWidths, setReceiptColumnWidths] = useState<number[] | null>(loadReceiptGridColumnWidths);
  const receiptTableRef = useRef<HTMLTableElement | null>(null);
  const receiptFilterPopoverRef = useRef<HTMLDivElement | null>(null);

  const customerFilteredReceipts = selectedCustomerId
    ? props.receipts.filter((receipt) => receipt.customerId === selectedCustomerId)
    : props.receipts;
  const filteredReceipts = customerFilteredReceipts.filter((receipt) => {
    const text = `${receipt.transactionNo ?? ""} ${receipt.note ?? ""}`.toLowerCase();
    const matchesMethod = !method || receipt.method === method;
    const matchesKeyword = !keyword.trim() || text.includes(keyword.trim().toLowerCase());
    return matchesMethod && matchesKeyword;
  });

  function getReceiptCustomerName(customerId: string) {
    const customer = props.customers.find((item) => item.id === customerId);
    const profile = props.customerProfiles.find((item) => item.id === customerId);
    return profile?.shortName || profile?.fullName || customer?.name || "-";
  }

  const receiptRows: ReceiptGridRow[] = filteredReceipts.map((receipt) => {
    const allocated = getReceiptAllocatedAmount(receipt.id, props.allocations);
    const unallocated = roundMoney(receipt.amount - allocated);
    return {
      receipt,
      allocated,
      unallocated,
      values: {
        customer: getReceiptCustomerName(receipt.customerId),
        receiptDate: receipt.receiptDate,
        amount: formatMoney(receipt.amount),
        allocated: formatMoney(allocated),
        unallocated: formatMoney(unallocated),
        method: receipt.method,
        transactionNo: receipt.transactionNo || "-",
        note: receipt.note || "-",
      },
    };
  });
  const receiptColumnValues = receiptGridFilterColumns.reduce<Record<ReceiptGridFilterColumnId, string[]>>(
    (result, column) => {
      result[column.id] = Array.from(new Set(receiptRows.map((row) => row.values[column.id]))).sort((left, right) => left.localeCompare(right, "zh-CN"));
      return result;
    },
    {} as Record<ReceiptGridFilterColumnId, string[]>,
  );
  const visibleReceiptRows = receiptRows.filter((row) =>
    receiptGridFilterColumns.every((column) => {
      const query = columnQueries[column.id].trim().toLowerCase();
      const selection = columnSelections[column.id];
      const value = row.values[column.id];
      return (!query || value.toLowerCase().includes(query)) && (!selection || selection.includes(value));
    }),
  );
  const totalAmount = visibleReceiptRows.reduce((sum, row) => sum + row.receipt.amount, 0);
  const totalAllocated = visibleReceiptRows.reduce((sum, row) => sum + row.allocated, 0);
  const totalUnallocated = visibleReceiptRows.reduce((sum, row) => sum + row.unallocated, 0);
  const receiptTableWidth = receiptColumnWidths?.reduce((sum, width) => sum + width, 0) ?? 1348;

  useEffect(() => {
    if (!activeFilterColumn) return;
    const closeFilterPopover = (event: MouseEvent) => {
      if (!receiptFilterPopoverRef.current?.contains(event.target as Node)) {
        setActiveFilterColumn(null);
      }
    };
    document.addEventListener("mousedown", closeFilterPopover);
    return () => document.removeEventListener("mousedown", closeFilterPopover);
  }, [activeFilterColumn]);

  useEffect(() => {
    if (!receiptColumnWidths) return;
    try {
      window.localStorage.setItem(RECEIPT_GRID_COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(receiptColumnWidths));
    } catch {
      // 列宽记录失败不影响日常收款操作。
    }
  }, [receiptColumnWidths]);

  function beginReceiptColumnResize(columnIndex: number, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const table = receiptTableRef.current;
    if (!table) return;

    const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead tr:first-child th"));
    const initialWidths = receiptColumnWidths ?? headers.map((header) => header.getBoundingClientRect().width);
    const minimumWidths = [126, 126, 132, 118, 118, 112, 150, 160, 118];
    const startX = event.clientX;
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidths = [...initialWidths];
      nextWidths[columnIndex] = Math.max(minimumWidths[columnIndex], initialWidths[columnIndex] + moveEvent.clientX - startX);
      setReceiptColumnWidths(nextWidths);
    };
    const stopResize = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", stopResize);
      document.body.classList.remove("is-column-resizing");
    };

    document.body.classList.add("is-column-resizing");
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", stopResize, { once: true });
  }

  function setReceiptColumnQuery(columnId: ReceiptGridFilterColumnId, value: string) {
    setColumnQueries((current) => ({ ...current, [columnId]: value }));
  }

  function toggleReceiptColumnFilter(columnId: ReceiptGridFilterColumnId) {
    setActiveFilterColumn((current) => (current === columnId ? null : columnId));
    setFilterValueSearch("");
  }

  function setReceiptColumnSelection(columnId: ReceiptGridFilterColumnId, values: string[]) {
    setColumnSelections((current) => ({ ...current, [columnId]: values }));
  }

  function toggleReceiptColumnValue(columnId: ReceiptGridFilterColumnId, value: string) {
    const allValues = receiptColumnValues[columnId];
    setColumnSelections((current) => {
      const selectedValues = new Set(current[columnId] ?? allValues);
      if (selectedValues.has(value)) selectedValues.delete(value);
      else selectedValues.add(value);
      return { ...current, [columnId]: Array.from(selectedValues) };
    });
  }

  function clearReceiptColumnFilter(columnId: ReceiptGridFilterColumnId) {
    setReceiptColumnQuery(columnId, "");
    setColumnSelections((current) => {
      const { [columnId]: _discarded, ...remaining } = current;
      return remaining;
    });
    setFilterValueSearch("");
  }

  async function importReceiptFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const result = await readReceiptImportFile(file);
      props.onImport(result.rows, result.warnings);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "收款记录导入失败，请检查 Excel 文件。");
    }
  }

  return (
    <section className="recon-simple-panel records-fill-page receipt-records-page">
      <div className="recon-panel-head receipt-records-head">
        <div className="module-filter-grid receipt-records-filter-grid">
          <label>
            客户
            <SearchableSelect
              ariaLabel="客户"
              emptyText="无匹配客户"
              onChange={setSelectedCustomerId}
              options={[{ label: "全部客户", value: "" }, ...props.customers.map((customer) => ({ label: getReceiptCustomerName(customer.id), value: customer.id }))]}
              placeholder="全部客户"
              value={selectedCustomerId}
            />
          </label>
          <label>
            收款方式
            <AnimatedSelect
              ariaLabel="收款方式"
              onChange={(value) => setMethod(value as PaymentMethod | "")}
              options={[{ label: "全部方式", value: "" }, ...toSelectOptions(paymentMethods)]}
              value={method}
            />
          </label>
          <label>
            流水号 / 备注
            <input onChange={(event) => setKeyword(event.target.value)} placeholder="输入关键词" value={keyword} />
          </label>
          <button
            className="recon-button recon-button-light"
            onClick={() => {
              setSelectedCustomerId("");
              setMethod("");
              setKeyword("");
              setColumnQueries(createEmptyReceiptColumnQueries());
              setColumnSelections({});
              setActiveFilterColumn(null);
            }}
            type="button"
          >
            重置
          </button>
        </div>
        <label className="recon-button recon-button-primary payment-import-trigger">
          <Upload size={16} />
          导入收款
          <input accept=".xlsx,.csv" onChange={importReceiptFile} type="file" />
        </label>
      </div>
      <div className="receipt-grid-scroll">
        <table
          className="recon-table recon-table-stable receipt-grid-table"
          ref={receiptTableRef}
          style={{ minWidth: "100%", width: receiptColumnWidths ? `${receiptTableWidth}px` : "100%" }}
        >
          <colgroup>
            {receiptGridColumns.map((column, index) => (
              <col key={column.id} style={{ width: receiptColumnWidths ? `${receiptColumnWidths[index]}px` : column.width }} />
            ))}
          </colgroup>
          <thead>
            <tr className="receipt-grid-header-row">
              {receiptGridColumns.map((column, index) => {
                const filterColumn = column.id === "actions" ? undefined : column.id;
                const values = filterColumn ? receiptColumnValues[filterColumn] : [];
                const selectedValues = filterColumn ? columnSelections[filterColumn] ?? values : [];
                const isFiltered = Boolean(
                  filterColumn &&
                    (columnQueries[filterColumn] || (columnSelections[filterColumn] && selectedValues.length !== values.length)),
                );
                const visibleValues = values.filter((value) => value.toLowerCase().includes(filterValueSearch.trim().toLowerCase()));
                return (
                  <th key={column.id}>
                    <div className="receipt-grid-header-content" ref={activeFilterColumn === filterColumn ? receiptFilterPopoverRef : undefined}>
                      <span>{column.label}</span>
                      {filterColumn && (
                        <button
                          aria-label={`筛选${column.label}`}
                          className={`receipt-grid-filter-button ${isFiltered ? "is-active" : ""}`}
                          onClick={() => toggleReceiptColumnFilter(filterColumn)}
                          title={`筛选${column.label}`}
                          type="button"
                        >
                          <Filter size={14} />
                        </button>
                      )}
                      {filterColumn && activeFilterColumn === filterColumn && (
                        <div className="receipt-grid-filter-popover" role="dialog" aria-label={`筛选${column.label}`}>
                          <div className="receipt-grid-filter-popover__head">
                            <strong>{column.label}筛选</strong>
                            <button onClick={() => clearReceiptColumnFilter(filterColumn)} type="button">清除</button>
                          </div>
                          <input
                            aria-label={`搜索${column.label}筛选值`}
                            autoFocus
                            onChange={(event) => setFilterValueSearch(event.target.value)}
                            placeholder="搜索筛选值"
                            value={filterValueSearch}
                          />
                          <label className="receipt-grid-filter-check receipt-grid-filter-check-all">
                            <input
                              checked={selectedValues.length === values.length}
                              onChange={(event) => setReceiptColumnSelection(filterColumn, event.target.checked ? values : [])}
                              type="checkbox"
                            />
                            全部
                          </label>
                          <div className="receipt-grid-filter-values">
                            {visibleValues.map((value) => (
                              <label className="receipt-grid-filter-check" key={value}>
                                <input
                                  checked={selectedValues.includes(value)}
                                  onChange={() => toggleReceiptColumnValue(filterColumn, value)}
                                  type="checkbox"
                                />
                                <span title={value}>{value}</span>
                              </label>
                            ))}
                            {visibleValues.length === 0 && <span className="receipt-grid-filter-empty">没有匹配项</span>}
                          </div>
                        </div>
                      )}
                    </div>
                    {index < receiptGridColumns.length - 1 && (
                      <button
                        aria-label={`调整${column.label}列宽`}
                        className="recon-column-resizer"
                        onPointerDown={(event) => beginReceiptColumnResize(index, event)}
                        title="拖动调整列宽"
                        type="button"
                      />
                    )}
                  </th>
                );
              })}
            </tr>
            <tr className="receipt-grid-filter-row">
              {receiptGridColumns.map((column) => {
                const filterColumn = column.id === "actions" ? undefined : column.id;
                return (
                  <th key={column.id}>
                    {filterColumn && (
                      <input
                        aria-label={`快速筛选${column.label}`}
                        onChange={(event) => setReceiptColumnQuery(filterColumn, event.target.value)}
                        placeholder="筛选"
                        value={columnQueries[filterColumn]}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleReceiptRows.map(({ receipt, allocated, unallocated }) => (
              <tr key={receipt.id}>
                <td>{getReceiptCustomerName(receipt.customerId)}</td>
                <td>{receipt.receiptDate}</td>
                <td>¥ {formatMoney(receipt.amount)}</td>
                <td>¥ {formatMoney(allocated)}</td>
                <td className={unallocated > 0 ? "is-danger" : "is-ok"}>¥ {formatMoney(unallocated)}</td>
                <td>{receipt.method}</td>
                <td>{receipt.transactionNo || "-"}</td>
                <td>{receipt.note || "-"}</td>
                <td>
                  <div className="recon-row-actions">
                    <button
                      aria-label="编辑收款"
                      disabled={receipt.isLocked}
                      onClick={() => setEditingReceipt(receipt)}
                      title={receipt.isLocked ? "该收款已锁定，需在收款池解锁后才能编辑" : "编辑"}
                      type="button"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      aria-label="收款分配"
                      className="is-allocation-action"
                      onClick={() => props.onAllocate(receipt.customerId)}
                      title="收款分配"
                      type="button"
                    >
                      <Network size={16} />
                    </button>
                    <button
                      aria-label="删除收款"
                      className="is-danger-action"
                      disabled={receipt.isLocked}
                      onClick={() => setPendingDeleteReceipt(receipt)}
                      title={receipt.isLocked ? "该收款已锁定，需在收款池解锁后才能删除" : "删除"}
                      type="button"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="receipt-grid-summary" aria-label="当前收款合计">
        <strong>当前合计</strong>
        <div>
          <span>收款金额 <b>¥ {formatMoney(totalAmount)}</b></span>
          <span>已分配 <b>¥ {formatMoney(totalAllocated)}</b></span>
          <span className={totalUnallocated > 0 ? "is-danger" : "is-ok"}>未分配 <b>¥ {formatMoney(totalUnallocated)}</b></span>
        </div>
      </footer>
      {editingReceipt && (
        <ReceiptRecordEditModal
          allocatedAmount={getReceiptAllocatedAmount(editingReceipt.id, props.allocations)}
          customerProfiles={props.customerProfiles}
          customers={props.customers}
          onClose={() => setEditingReceipt(null)}
          onSave={(receipt) => {
            props.onSaveReceipt(receipt);
            setEditingReceipt(null);
          }}
          receipt={editingReceipt}
        />
      )}
      {pendingDeleteReceipt && (
        <ConfirmationDialog
          confirmLabel="确认删除"
          description={
            getReceiptAllocatedAmount(pendingDeleteReceipt.id, props.allocations) > 0
              ? "该收款已有分配记录。删除后将同步从客户收款池移除，并撤销相关收款分配，影响对应对账结果。"
              : "删除后将同步从客户对账的收款池移除这笔记录。"
          }
          onCancel={() => setPendingDeleteReceipt(null)}
          onConfirm={() => {
            props.onDeleteReceipt(pendingDeleteReceipt.id);
            setPendingDeleteReceipt(null);
          }}
          title="确认删除这笔收款？"
          tone="danger"
        />
      )}
    </section>
  );
}

function ReceiptRecordEditModal(props: {
  allocatedAmount: number;
  customerProfiles: CustomerProfile[];
  customers: Customer[];
  onClose(): void;
  onSave(receipt: CustomerReceipt): void;
  receipt: CustomerReceipt;
}) {
  const [customerId, setCustomerId] = useState(props.receipt.customerId);
  const [receiptDate, setReceiptDate] = useState(props.receipt.receiptDate);
  const [amount, setAmount] = useState(props.receipt.amount.toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>(props.receipt.method);
  const [transactionNo, setTransactionNo] = useState(props.receipt.transactionNo ?? "");
  const [note, setNote] = useState(props.receipt.note ?? "");
  const [error, setError] = useState("");
  const customerOptions = props.customers.map((customer) => {
    const profile = props.customerProfiles.find((item) => item.id === customer.id);
    return {
      label: profile?.shortName || profile?.fullName || customer.name,
      value: customer.id,
    };
  });

  return (
    <Modal onClose={props.onClose} title="编辑收款记录">
      <form
        className="recon-form"
        onSubmit={(event) => {
          event.preventDefault();
          const parsedAmount = roundMoney(parseMoney(amount));
          if (!/^\d{4}-\d{2}-\d{2}$/.test(receiptDate)) {
            setError("收款日期必须使用 YYYY-MM-DD 格式。");
            return;
          }
          if (parsedAmount <= 0) {
            setError("收款金额必须大于 0。");
            return;
          }
          if (parsedAmount < props.allocatedAmount) {
            setError(`收款金额不能小于已分配金额 ¥ ${formatMoney(props.allocatedAmount)}。`);
            return;
          }
          if (customerId !== props.receipt.customerId && props.allocatedAmount > 0) {
            setError("这笔收款已有分配记录，请先删除相关分配后再更换客户。");
            return;
          }
          props.onSave({
            ...props.receipt,
            customerId,
            receiptDate,
            amount: parsedAmount,
            method,
            transactionNo: transactionNo.trim(),
            periodMonth: undefined,
            note: note.trim(),
          });
        }}
      >
        <>
          <Field label="客户" required>
            <AnimatedSelect ariaLabel="客户" onChange={setCustomerId} options={customerOptions} value={customerId} />
          </Field>
          <Field label="收款日期" required>
            <input onChange={(event) => setReceiptDate(event.target.value)} type="date" value={receiptDate} />
          </Field>
          <Field label="收款金额" required>
            <input min="0" onChange={(event) => setAmount(event.target.value)} step="0.01" type="number" value={amount} />
          </Field>
          <Field label="收款方式">
            <AnimatedSelect ariaLabel="收款方式" onChange={(value) => setMethod(value as PaymentMethod)} options={toSelectOptions(paymentMethods)} value={method} />
          </Field>
          <Field label="流水号 / 承兑编号">
            <input onChange={(event) => setTransactionNo(event.target.value)} value={transactionNo} />
          </Field>
          <Field label="备注">
            <textarea onChange={(event) => setNote(event.target.value)} value={note} />
          </Field>
          <div className="receipt-edit-summary">
            已分配 ¥ {formatMoney(props.allocatedAmount)} / 未分配 ¥ {formatMoney(Math.max(parseMoney(amount) - props.allocatedAmount, 0))}
          </div>
          {error && <div className="receipt-pool__error">{error}</div>}
          <ModalActions onClose={props.onClose} submitLabel="保存收款" />
        </>
      </form>
    </Modal>
  );
}

function FinancialInvoiceEditModal(props: {
  allocatedAmount: number;
  customerOptions: Array<{ label: string; value: string }>;
  invoice: CustomerInvoice;
  onClose(): void;
  onSave(invoice: CustomerInvoice): void;
}) {
  const [customerId, setCustomerId] = useState(props.invoice.customerId);
  const [invoiceDate, setInvoiceDate] = useState(props.invoice.invoiceDate);
  const [invoiceNo, setInvoiceNo] = useState(props.invoice.invoiceNo);
  const [amount, setAmount] = useState(props.invoice.amount.toFixed(2));
  const [note, setNote] = useState(props.invoice.note ?? "");
  const [error, setError] = useState("");

  return (
    <Modal onClose={props.onClose} title="编辑开票记录">
      <form
        className="recon-form"
        onSubmit={(event) => {
          event.preventDefault();
          const parsedAmount = roundMoney(parseMoney(amount));
          if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
            setError("开票日期必须使用 YYYY-MM-DD 格式。");
            return;
          }
          if (parsedAmount <= 0) {
            setError("开票金额必须大于 0。");
            return;
          }
          if (parsedAmount < props.allocatedAmount) {
            setError(`开票金额不能小于已分配金额 ¥ ${formatMoney(props.allocatedAmount)}。`);
            return;
          }
          if (customerId !== props.invoice.customerId && props.allocatedAmount > 0) {
            setError("这条开票已有分配记录，请先删除相关分配后再更换客户。");
            return;
          }
          props.onSave({
            ...props.invoice,
            amount: parsedAmount,
            customerId,
            invoiceDate,
            invoiceNo: invoiceNo.trim(),
            note: note.trim(),
          });
        }}
      >
        <>
          <Field label="客户" required>
            <AnimatedSelect ariaLabel="客户" onChange={setCustomerId} options={props.customerOptions} value={customerId} />
          </Field>
          <Field label="开票日期" required>
            <input onChange={(event) => setInvoiceDate(event.target.value)} type="date" value={invoiceDate} />
          </Field>
          <Field label="发票号码">
            <input onChange={(event) => setInvoiceNo(event.target.value)} value={invoiceNo} />
          </Field>
          <Field label="开票金额" required>
            <input min="0" onChange={(event) => setAmount(event.target.value)} step="0.01" type="number" value={amount} />
          </Field>
          <Field label="备注">
            <textarea onChange={(event) => setNote(event.target.value)} value={note} />
          </Field>
          <div className="receipt-edit-summary">已分配 ¥ {formatMoney(props.allocatedAmount)} / 未分配 ¥ {formatMoney(Math.max(parseMoney(amount) - props.allocatedAmount, 0))}</div>
          {error && <div className="receipt-pool__error">{error}</div>}
          <ModalActions onClose={props.onClose} submitLabel="保存开票" />
        </>
      </form>
    </Modal>
  );
}

function SettingsModule(props: { auditLogs: AuditLog[] }) {
  const auth = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [logDateFrom, setLogDateFrom] = useState("");
  const [logDateTo, setLogDateTo] = useState("");
  const [logModule, setLogModule] = useState("");
  const [logAction, setLogAction] = useState("");
  const [logKeyword, setLogKeyword] = useState("");
  const [logOperator, setLogOperator] = useState("");
  const [viewingLog, setViewingLog] = useState<AuditLog | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致。");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        body: JSON.stringify({ oldPassword, newPassword }),
        headers: {
          Authorization: `Bearer ${auth.token}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message || "修改密码失败。");
      }
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("密码已修改。");
      await auth.checkSession();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "修改密码失败。");
    } finally {
      setSaving(false);
    }
  }

  const filteredAuditLogs = useMemo(() => {
    const keyword = logKeyword.trim().toLowerCase();
    return props.auditLogs
      .filter((log) => {
        const logDate = log.createdAt.slice(0, 10);
        const matchesDate = (!logDateFrom || logDate >= logDateFrom) && (!logDateTo || logDate <= logDateTo);
        const matchesModule = !logModule || log.module === logModule;
        const matchesAction = !logAction || log.action === logAction;
        const matchesOperator = !logOperator.trim() || (log.displayName ?? "").toLowerCase().includes(logOperator.trim().toLowerCase());
        const matchesKeyword =
          !keyword || `${log.description} ${log.entityType}`.toLowerCase().includes(keyword);
        return matchesDate && matchesModule && matchesAction && matchesOperator && matchesKeyword;
      })
      .slice(-300)
      .reverse();
  }, [logAction, logDateFrom, logDateTo, logKeyword, logModule, logOperator, props.auditLogs]);

  const auditModuleOptions = Array.from(new Set(props.auditLogs.map((log) => log.module)));
  const auditActionOptions = Array.from(new Set(props.auditLogs.map((log) => log.action)));

  return (
    <div className="recon-workspace">
      <section className="recon-simple-panel settings-panel">
        <div className="recon-panel-head">
          <div>
            <span>系统设置</span>
            <strong>账号安全</strong>
          </div>
        </div>
        <form className="recon-form settings-password-form" onSubmit={submit}>
          <Field label="当前密码" required>
            <input autoComplete="current-password" onChange={(event) => setOldPassword(event.target.value)} type="password" value={oldPassword} />
          </Field>
          <Field label="新密码" required>
            <input autoComplete="new-password" onChange={(event) => setNewPassword(event.target.value)} type="password" value={newPassword} />
          </Field>
          <Field label="确认新密码" required>
            <input autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)} type="password" value={confirmPassword} />
          </Field>
          {message && <div className="settings-message">{message}</div>}
          {error && <div className="settings-error">{error}</div>}
          <div>
            <button className="recon-button recon-button-primary" disabled={saving || !oldPassword || !newPassword || !confirmPassword} type="submit">
              {saving ? "保存中..." : "修改密码"}
            </button>
          </div>
        </form>
      </section>

      <section className="recon-simple-panel settings-panel">
        <div className="recon-panel-head">
          <div>
            <span>系统设置 / 操作日志</span>
            <strong>关键财务数据修改全程可追溯（只读，不可删除）</strong>
          </div>
        </div>
        <div className="module-filter-grid audit-log-filter-grid">
          <label>
            日期范围
            <span className="financial-date-range">
              <input aria-label="开始日期" onChange={(event) => setLogDateFrom(event.target.value)} type="date" value={logDateFrom} />
              <b>至</b>
              <input aria-label="结束日期" onChange={(event) => setLogDateTo(event.target.value)} type="date" value={logDateTo} />
            </span>
          </label>
          <label>
            操作人
            <input onChange={(event) => setLogOperator(event.target.value)} placeholder="输入操作人" value={logOperator} />
          </label>
          <label>
            模块
            <AnimatedSelect
              ariaLabel="模块"
              onChange={setLogModule}
              options={[{ label: "全部模块", value: "" }, ...auditModuleOptions.map((module) => ({ label: auditModuleLabels[module] ?? module, value: module }))]}
              value={logModule}
            />
          </label>
          <label>
            操作类型
            <AnimatedSelect
              ariaLabel="操作类型"
              onChange={setLogAction}
              options={[{ label: "全部类型", value: "" }, ...auditActionOptions.map((action) => ({ label: auditActionLabels[action] ?? action, value: action }))]}
              value={logAction}
            />
          </label>
          <label>
            关键词
            <input onChange={(event) => setLogKeyword(event.target.value)} placeholder="对象 / 说明" value={logKeyword} />
          </label>
          <button
            className="recon-button recon-button-light"
            onClick={() => {
              setLogDateFrom("");
              setLogDateTo("");
              setLogModule("");
              setLogAction("");
              setLogKeyword("");
              setLogOperator("");
            }}
            type="button"
          >
            重置
          </button>
        </div>
        <div className="recon-table-wrap">
          <table className="recon-table recon-table-stable">
            <colgroup>
              <col style={{ width: "14%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "40%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>时间</th>
                <th>操作人</th>
                <th>模块</th>
                <th>操作类型</th>
                <th>操作说明</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {filteredAuditLogs.length === 0 ? (
                <tr>
                  <td colSpan={6}>暂无符合条件的操作日志。修改客户、月度对账、款号应收、扣款调整、收款、开票、核销等关键数据后会自动记录。</td>
                </tr>
              ) : (
                filteredAuditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{log.createdAt.replace("T", " ").slice(0, 19)}</td>
                    <td>{log.displayName}</td>
                    <td>{auditModuleLabels[log.module] ?? log.module}</td>
                    <td>{auditActionLabels[log.action] ?? log.action}</td>
                    <td className="audit-log-description">{log.description}</td>
                    <td>
                      <button className="recon-inline-action" onClick={() => setViewingLog(log)} type="button">
                        详情
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {viewingLog && (
        <Modal onClose={() => setViewingLog(null)} size="receiptPool" title="操作日志详情">
          <>
            <div className="audit-detail-meta">
              <div>
                <span>操作说明</span>
                <strong>{viewingLog.description}</strong>
              </div>
              <div>
                <span>操作人</span>
                <strong>{viewingLog.displayName}（{viewingLog.username}）</strong>
              </div>
              <div>
                <span>时间</span>
                <strong>{viewingLog.createdAt.replace("T", " ").slice(0, 19)}</strong>
              </div>
              <div>
                <span>对象</span>
                <strong>{viewingLog.entityType} / {viewingLog.entityId}</strong>
              </div>
            </div>
            <div className="audit-detail-data">
              {(["beforeData", "afterData"] as const).map((dataKey) => (
                <div className="audit-detail-block" key={dataKey}>
                  <h4>{dataKey === "beforeData" ? "修改前" : "修改后"}</h4>
                  {viewingLog[dataKey] && Object.keys(viewingLog[dataKey]!).length > 0 ? (
                    <table className="recon-detail-info-table">
                      <tbody>
                        {Object.entries(viewingLog[dataKey]!).map(([field, value]) => (
                          <tr key={field}>
                            <th>{auditFieldLabels[field] ?? field}</th>
                            <td>{formatAuditValue(field, value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <EmptyPanel text="无数据" />
                  )}
                </div>
              ))}
            </div>
          </>
        </Modal>
      )}
    </div>
  );
}

function formatAuditValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "（空）";
  if (auditMoneyFields.has(field)) return `¥ ${formatMoney(Number(value))}`;
  if (field === "lifecycle") return statementLifecycleLabels[value as StatementLifecycle] ?? String(value);
  if (field === "direction") return value === "decrease" ? "调减" : "调增";
  if (field === "isLocked") return value === true ? "已锁定" : "未锁定";
  if (field === "needInvoiceBeforePayment") return value === true ? "是" : "否";
  return String(value);
}

function FinancialRecordsModule(props: {
  allocations: ReceiptAllocation[];
  customerProfiles: CustomerProfile[];
  customers: Customer[];
  invoiceAllocations: InvoiceAllocation[];
  invoices: CustomerInvoice[];
  onDeleteInvoice(invoiceId: string): void;
  onDeleteReceipt(receiptId: string): void;
  onImportInvoices(rows: InvoiceImportRow[], warnings: string[]): void;
  onImportReceipts(rows: ReceiptImportRow[], warnings: string[]): void;
  onSaveInvoice(invoice: CustomerInvoice): void;
  onSaveReceipt(receipt: CustomerReceipt): void;
  receipts: CustomerReceipt[];
}) {
  const [customerId, setCustomerId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [keyword, setKeyword] = useState("");
  const [settlementStatusFilter, setSettlementStatusFilter] = useState<import("./models").ReceiptSettlementStatus | "">("");
  const [columnQueries, setColumnQueries] = useState<Record<FinancialGridColumnId, string>>(() => createSpreadsheetColumnQueries(financialGridColumns));
  const [columnSelections, setColumnSelections] = useState<Partial<Record<FinancialGridColumnId, string[]>>>({});
  const [activeFilterColumn, setActiveFilterColumn] = useState<FinancialGridColumnId | null>(null);
  const [filterValueSearch, setFilterValueSearch] = useState("");
  const [financialColumnWidths, setFinancialColumnWidths] = useState<number[] | null>(() =>
    loadSpreadsheetGridColumnWidths(FINANCIAL_GRID_COLUMN_WIDTHS_STORAGE_KEY, financialGridColumns.length),
  );
  const [measuredFinancialColumnWidths, setMeasuredFinancialColumnWidths] = useState<number[] | null>(null);
  const [financialScrollLeft, setFinancialScrollLeft] = useState(0);
  const [editingReceipt, setEditingReceipt] = useState<CustomerReceipt | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<CustomerInvoice | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FinancialGridRow | null>(null);
  const financialTableRef = useRef<HTMLTableElement | null>(null);
  const financialFilterPopoverRef = useRef<HTMLDivElement | null>(null);

  const customerOptions = useMemo(
    () =>
      props.customers.map((customer) => {
        const profile = props.customerProfiles.find((item) => item.id === customer.id);
        return { label: profile?.shortName || profile?.fullName || customer.name, value: customer.id };
      }),
    [props.customerProfiles, props.customers],
  );

  const financialRows = useMemo<FinancialGridRow[]>(() => {
    const getCustomerName = (recordCustomerId: string) => customerOptions.find((option) => option.value === recordCustomerId)?.label ?? "未命名客户";
    const receiptRows = props.receipts.map<FinancialGridRow>((receipt) => {
      const settlement = getReceiptSettlementInfo(receipt, props.allocations);
      return {
        customerId: receipt.customerId,
        date: receipt.receiptDate,
        receipt,
        type: "receipt",
        values: {
          actions: "",
          customer: getCustomerName(receipt.customerId),
          date: receipt.receiptDate,
          documentNo: receipt.transactionNo || "-",
          invoiceAmount: "-",
          method: receipt.method || "-",
          note: receipt.note || "-",
          receiptAmount: `¥ ${formatMoney(receipt.amount)}`,
          receiptAllocated: `¥ ${formatMoney(settlement.allocatedAmount)}`,
          receiptUnallocated: `¥ ${formatMoney(settlement.unallocatedAmount)}`,
          settlementStatus: settlement.statusLabel,
        },
      };
    });
    const invoiceRows = props.invoices.map<FinancialGridRow>((invoice) => ({
      customerId: invoice.customerId,
      date: invoice.invoiceDate,
      invoice,
      type: "invoice",
      values: {
        actions: "",
        customer: getCustomerName(invoice.customerId),
        date: invoice.invoiceDate,
        documentNo: invoice.invoiceNo || "-",
        invoiceAmount: `¥ ${formatMoney(invoice.amount)}`,
        method: "-",
        note: invoice.note || "-",
        receiptAmount: "-",
        receiptAllocated: "-",
        receiptUnallocated: "-",
        settlementStatus: "-",
      },
    }));
    return [...receiptRows, ...invoiceRows].sort((left, right) => right.date.localeCompare(left.date));
  }, [customerOptions, props.allocations, props.invoices, props.receipts]);

  const topFilteredRows = financialRows.filter((row) => {
    const matchesCustomer = !customerId || row.customerId === customerId;
    const matchesDate = (!dateFrom || row.date >= dateFrom) && (!dateTo || row.date <= dateTo);
    const matchesKeyword =
      !keyword.trim() ||
      `${row.values.documentNo} ${row.values.note}`.toLowerCase().includes(keyword.trim().toLowerCase());
    const matchesSettlement =
      !settlementStatusFilter || row.type !== "receipt" || getReceiptSettlementInfo(row.receipt!, props.allocations).status === settlementStatusFilter;
    return matchesCustomer && matchesDate && matchesKeyword && matchesSettlement;
  });
  const financialColumnValues = getSpreadsheetColumnValues(financialGridColumns, topFilteredRows);
  const visibleFinancialRows = topFilteredRows.filter((row) =>
    financialGridColumns.every((column) => {
      if (column.filterable === false) return true;
      const query = columnQueries[column.id].trim().toLowerCase();
      const selection = columnSelections[column.id];
      const value = row.values[column.id];
      return (!query || value.toLowerCase().includes(query)) && (!selection || selection.includes(value));
    }),
  );
  const receiptTotal = sumMoney(visibleFinancialRows.filter((row) => row.type === "receipt").map((row) => row.receipt?.amount ?? 0));
  const invoiceTotal = sumMoney(visibleFinancialRows.filter((row) => row.type === "invoice").map((row) => row.invoice?.amount ?? 0));
  const invoiceReceiptDifference = roundMoney(invoiceTotal - receiptTotal);
  const financialTableWidth = financialColumnWidths?.reduce((sum, width) => sum + width, 0) ?? 0;
  // 表格在可视范围内会按最小宽度自动拉伸；汇总栏必须以最终表头宽度为准，才能始终逐列对齐。
  const financialSummaryColumnWidths = measuredFinancialColumnWidths ?? financialColumnWidths;
  const financialSummaryWidth = financialSummaryColumnWidths?.reduce((sum, width) => sum + width, 0) ?? 0;

  useEffect(() => {
    if (!activeFilterColumn) return;
    const closeFilterPopover = (event: MouseEvent) => {
      if (!financialFilterPopoverRef.current?.contains(event.target as Node)) setActiveFilterColumn(null);
    };
    document.addEventListener("mousedown", closeFilterPopover);
    return () => document.removeEventListener("mousedown", closeFilterPopover);
  }, [activeFilterColumn]);

  useEffect(() => {
    if (!financialColumnWidths) return;
    try {
      window.localStorage.setItem(FINANCIAL_GRID_COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(financialColumnWidths));
    } catch {
      // 列宽记录失败不影响财务明细使用。
    }
  }, [financialColumnWidths]);

  useEffect(() => {
    const table = financialTableRef.current;
    if (!table) return;

    const measureColumnWidths = () => {
      const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead tr:first-child th"));
      if (headers.length !== financialGridColumns.length) return;
      const nextWidths = headers.map((header) => Math.round(header.getBoundingClientRect().width * 100) / 100);
      setMeasuredFinancialColumnWidths((currentWidths) =>
        currentWidths?.length === nextWidths.length && currentWidths.every((width, index) => Math.abs(width - nextWidths[index]) < 0.5)
          ? currentWidths
          : nextWidths,
      );
    };

    measureColumnWidths();
    const observer = new ResizeObserver(measureColumnWidths);
    observer.observe(table);
    return () => observer.disconnect();
  }, [financialColumnWidths]);

  function setFinancialColumnQuery(columnId: FinancialGridColumnId, value: string) {
    setColumnQueries((current) => ({ ...current, [columnId]: value }));
  }

  function setFinancialColumnSelection(columnId: FinancialGridColumnId, values: string[]) {
    setColumnSelections((current) => ({ ...current, [columnId]: values }));
  }

  function toggleFinancialColumnValue(columnId: FinancialGridColumnId, value: string) {
    const allValues = financialColumnValues[columnId];
    setColumnSelections((current) => {
      const selectedValues = new Set(current[columnId] ?? allValues);
      if (selectedValues.has(value)) selectedValues.delete(value);
      else selectedValues.add(value);
      return { ...current, [columnId]: Array.from(selectedValues) };
    });
  }

  function clearFinancialColumnFilter(columnId: FinancialGridColumnId) {
    setFinancialColumnQuery(columnId, "");
    setColumnSelections((current) => {
      const { [columnId]: _discarded, ...remaining } = current;
      return remaining;
    });
    setFilterValueSearch("");
  }

  function resetFilters() {
    setCustomerId("");
    setDateFrom("");
    setDateTo("");
    setKeyword("");
    setSettlementStatusFilter("");
    setColumnQueries(createSpreadsheetColumnQueries(financialGridColumns));
    setColumnSelections({});
    setActiveFilterColumn(null);
    setFilterValueSearch("");
  }

  async function importReceiptFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const result = await readReceiptImportFile(file);
      props.onImportReceipts(result.rows, result.warnings);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "收款记录导入失败，请检查 Excel 文件。");
    }
  }

  async function importInvoiceFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const result = await readInvoiceImportFile(file);
      props.onImportInvoices(result.rows, result.warnings);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "开票记录导入失败，请检查 Excel 文件。");
    }
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    if (pendingDelete.type === "receipt" && pendingDelete.receipt) props.onDeleteReceipt(pendingDelete.receipt.id);
    if (pendingDelete.type === "invoice" && pendingDelete.invoice) props.onDeleteInvoice(pendingDelete.invoice.id);
    setPendingDelete(null);
  }

  return (
    <section className="recon-simple-panel records-fill-page financial-records-page">
      <div className="recon-panel-head financial-records-head">
        <div className="module-filter-grid financial-records-filter-grid">
          <label>
            客户
            <SearchableSelect
              ariaLabel="客户"
              emptyText="无匹配客户"
              onChange={setCustomerId}
              options={[{ label: "全部客户", value: "" }, ...customerOptions]}
              placeholder="全部客户"
              value={customerId}
            />
          </label>
          <label>
            日期范围
            <span className="financial-date-range">
              <input aria-label="开始日期" onChange={(event) => setDateFrom(event.target.value)} type="date" value={dateFrom} />
              <b>至</b>
              <input aria-label="结束日期" onChange={(event) => setDateTo(event.target.value)} type="date" value={dateTo} />
            </span>
          </label>
          <label>
            单据编号 / 备注
            <input onChange={(event) => setKeyword(event.target.value)} placeholder="输入关键词" value={keyword} />
          </label>
          <label>
            核销状态
            <AnimatedSelect
              ariaLabel="核销状态"
              onChange={(value) => setSettlementStatusFilter(value as import("./models").ReceiptSettlementStatus | "")}
              options={[
                { label: "全部状态", value: "" },
                { label: "未核销", value: "unallocated" },
                { label: "部分核销", value: "partial" },
                { label: "已核销", value: "allocated" },
              ]}
              value={settlementStatusFilter}
            />
          </label>
          <button className="recon-button recon-button-light" onClick={resetFilters} type="button">重置</button>
        </div>
        <div className="financial-import-actions">
          <label className="recon-button recon-button-primary payment-import-trigger">
            <Upload size={16} />
            导入收款
            <input accept=".xlsx,.csv" onChange={importReceiptFile} type="file" />
          </label>
          <label className="recon-button recon-button-light payment-import-trigger">
            <Upload size={16} />
            导入开票
            <input accept=".xlsx,.csv" onChange={importInvoiceFile} type="file" />
          </label>
        </div>
      </div>
      <div className="receipt-grid-scroll financial-grid-scroll" onScroll={(event) => setFinancialScrollLeft(event.currentTarget.scrollLeft)}>
        <table
          className="recon-table recon-table-stable receipt-grid-table financial-grid-table"
          ref={financialTableRef}
          style={{
            minWidth: "100%",
            width: financialColumnWidths ? `${financialTableWidth}px` : "100%",
          }}
        >
          <colgroup>
            {financialGridColumns.map((column, index) => (
              <col key={column.id} style={{ width: financialColumnWidths ? `${financialColumnWidths[index]}px` : column.width }} />
            ))}
          </colgroup>
          <SpreadsheetGridHeader
            activeFilterColumn={activeFilterColumn}
            columnQueries={columnQueries}
            columnSelections={columnSelections}
            columnValues={financialColumnValues}
            columns={financialGridColumns}
            filterPopoverRef={financialFilterPopoverRef}
            filterValueSearch={filterValueSearch}
            onBeginResize={(columnIndex, event) =>
              beginSpreadsheetColumnResize(
                financialTableRef.current,
                financialColumnWidths,
                financialGridColumns.map((column) => column.minWidth),
                columnIndex,
                event,
                setFinancialColumnWidths,
              )
            }
            onClearColumnFilter={clearFinancialColumnFilter}
            onColumnQueryChange={setFinancialColumnQuery}
            onColumnSelectionChange={setFinancialColumnSelection}
            onFilterValueSearchChange={setFilterValueSearch}
            onToggleColumnFilter={(columnId) => {
              setActiveFilterColumn((current) => (current === columnId ? null : columnId));
              setFilterValueSearch("");
            }}
            onToggleColumnValue={toggleFinancialColumnValue}
          />
          <tbody>
            {visibleFinancialRows.map((row) => {
              const record = row.receipt ?? row.invoice;
              const isLocked = record?.isLocked ?? false;
              return (
                <tr key={`${row.type}-${record?.id ?? row.date}`}>
                  <td>{row.values.date}</td>
                  <td>{row.values.customer}</td>
                  <td>{row.values.documentNo}</td>
                  <td>{row.values.method}</td>
                  <td className={row.type === "receipt" ? "financial-amount is-receipt" : "financial-amount"}>{row.values.receiptAmount}</td>
                  <td className="financial-amount">{row.values.receiptAllocated}</td>
                  <td className="financial-amount">{row.values.receiptUnallocated}</td>
                  <td>
                    {row.type === "receipt" ? (
                      <span className={`settlement-status is-${
                        getReceiptSettlementInfo(row.receipt!, props.allocations).status
                      }`}>{row.values.settlementStatus}</span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className={row.type === "invoice" ? "financial-amount is-invoice" : "financial-amount"}>{row.values.invoiceAmount}</td>
                  <td>{row.values.note}</td>
                  <td>
                    <div className="recon-row-actions financial-row-actions">
                      <button
                        aria-label={row.type === "receipt" ? "编辑收款" : "编辑开票"}
                        disabled={isLocked}
                        onClick={() => (row.receipt ? setEditingReceipt(row.receipt) : row.invoice ? setEditingInvoice(row.invoice) : undefined)}
                        title={isLocked ? "记录已锁定，请先在客户对账的资金池中解锁" : "编辑"}
                        type="button"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        aria-label={row.type === "receipt" ? "删除收款" : "删除开票"}
                        className="is-danger-action"
                        disabled={isLocked}
                        onClick={() => setPendingDelete(row)}
                        title={isLocked ? "记录已锁定，请先在客户对账的资金池中解锁" : "删除"}
                        type="button"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibleFinancialRows.length === 0 && (
              <tr>
                <td className="recon-empty" colSpan={financialGridColumns.length}>暂无符合条件的财务明细。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className="financial-grid-summary-bar" aria-label="当前财务合计">
        <div
          className="financial-grid-summary-row"
          style={{
            gridTemplateColumns: financialSummaryColumnWidths
              ? financialSummaryColumnWidths.map((width) => `${width}px`).join(" ")
              : financialGridColumns.map((column) => column.width).join(" "),
            transform: `translateX(-${financialScrollLeft}px)`,
            width: financialSummaryColumnWidths ? `${financialSummaryWidth}px` : "100%",
          }}
        >
          <div className="financial-grid-total-label">当前合计</div>
          <div className="financial-grid-total-amount is-receipt">
            <span>收款金额</span>
            <b>¥ {formatMoney(receiptTotal)}</b>
          </div>
          <div className="financial-grid-total-amount is-invoice">
            <span>开票金额</span>
            <b>¥ {formatMoney(invoiceTotal)}</b>
          </div>
          <div className={`financial-grid-total-amount financial-grid-total-difference ${invoiceReceiptDifference > 0 ? "is-positive" : invoiceReceiptDifference < 0 ? "is-negative" : ""}`}>
            <span>开收差额</span>
            <b>{invoiceReceiptDifference > 0 ? "¥ " : invoiceReceiptDifference < 0 ? "- ¥ " : "¥ "}{formatMoney(Math.abs(invoiceReceiptDifference))}</b>
          </div>
        </div>
      </footer>
      {editingReceipt && (
        <ReceiptRecordEditModal
          allocatedAmount={getReceiptAllocatedAmount(editingReceipt.id, props.allocations)}
          customerProfiles={props.customerProfiles}
          customers={props.customers}
          onClose={() => setEditingReceipt(null)}
          onSave={(receipt) => {
            props.onSaveReceipt(receipt);
            setEditingReceipt(null);
          }}
          receipt={editingReceipt}
        />
      )}
      {editingInvoice && (
        <FinancialInvoiceEditModal
          allocatedAmount={getInvoiceAllocatedAmount(editingInvoice.id, props.invoiceAllocations)}
          customerOptions={customerOptions}
          invoice={editingInvoice}
          onClose={() => setEditingInvoice(null)}
          onSave={(invoice) => {
            props.onSaveInvoice(invoice);
            setEditingInvoice(null);
          }}
        />
      )}
      {pendingDelete && (
        <ConfirmationDialog
          confirmLabel="确认删除"
          description={
            pendingDelete.type === "receipt"
              ? getReceiptAllocatedAmount(pendingDelete.receipt?.id ?? "", props.allocations) > 0
                ? "该收款已有分配记录，删除后会同步移除相关分配并影响对账结果。"
                : "删除后无法恢复，是否确认删除这笔收款？"
              : getInvoiceAllocatedAmount(pendingDelete.invoice?.id ?? "", props.invoiceAllocations) > 0
                ? "该开票已有分配记录，删除后会同步移除相关分配并影响对账结果。"
                : "删除后无法恢复，是否确认删除这条开票记录？"
          }
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
          title={pendingDelete.type === "receipt" ? "确认删除收款" : "确认删除开票"}
          tone="danger"
        />
      )}
    </section>
  );
}

function InvoiceRecordsModule(props: {
  customers: Customer[];
  invoices: CustomerInvoice[];
  invoiceAllocations: InvoiceAllocation[];
  onImport(rows: InvoiceImportRow[], warnings: string[]): void;
  styleAccounts: StyleAccount[];
}) {
  const [customerId, setCustomerId] = useState("");
  const [periodMonth, setPeriodMonth] = useState("");
  const [styleKeyword, setStyleKeyword] = useState("");
  const [invoiceKeyword, setInvoiceKeyword] = useState("");
  const [columnQueries, setColumnQueries] = useState<Record<InvoiceGridColumnId, string>>(() => createSpreadsheetColumnQueries(invoiceGridColumns));
  const [columnSelections, setColumnSelections] = useState<Partial<Record<InvoiceGridColumnId, string[]>>>({});
  const [activeFilterColumn, setActiveFilterColumn] = useState<InvoiceGridColumnId | null>(null);
  const [filterValueSearch, setFilterValueSearch] = useState("");
  const [invoiceColumnWidths, setInvoiceColumnWidths] = useState<number[] | null>(() =>
    loadSpreadsheetGridColumnWidths(INVOICE_GRID_COLUMN_WIDTHS_STORAGE_KEY, invoiceGridColumns.length),
  );
  const invoiceTableRef = useRef<HTMLTableElement | null>(null);
  const invoiceFilterPopoverRef = useRef<HTMLDivElement | null>(null);
  const rows = props.invoices.map((invoice) => {
    const allocations = props.invoiceAllocations.filter((allocation) => allocation.invoiceId === invoice.id);
    const styleNos = allocations
      .map((allocation) => props.styleAccounts.find((account) => account.id === allocation.styleAccountId)?.styleNo)
      .filter((styleNo): styleNo is string => Boolean(styleNo));
    return { customer: props.customers.find((customer) => customer.id === invoice.customerId), invoice, styleNos };
  });
  const periodOptions = Array.from(new Set(rows.map((row) => row.invoice.invoiceDate.slice(0, 7)))).sort().reverse();
  const filteredRows = rows.filter(({ invoice, styleNos }) => {
    const matchesCustomer = !customerId || invoice.customerId === customerId;
    const matchesPeriod = !periodMonth || invoice.invoiceDate.slice(0, 7) === periodMonth;
    const matchesStyle = !styleKeyword.trim() || styleNos.join(" ").toLowerCase().includes(styleKeyword.trim().toLowerCase());
    const matchesInvoice =
      !invoiceKeyword.trim() ||
      `${invoice.invoiceNo} ${invoice.note ?? ""}`.toLowerCase().includes(invoiceKeyword.trim().toLowerCase());
    return matchesCustomer && matchesPeriod && matchesStyle && matchesInvoice;
  });
  const invoiceGridRows: Array<SpreadsheetGridRow<InvoiceGridColumnId> & { row: (typeof filteredRows)[number] }> = filteredRows.map((row) => ({
    row,
    values: {
      customer: row.customer?.name ?? "-",
      styleNos: row.styleNos.length > 0 ? row.styleNos.join("、") : "未分配",
      invoiceDate: row.invoice.invoiceDate,
      invoiceNo: row.invoice.invoiceNo || "-",
      amount: formatMoney(row.invoice.amount),
      note: row.invoice.note || "-",
    },
  }));
  const invoiceColumnValues = getSpreadsheetColumnValues(invoiceGridColumns, invoiceGridRows);
  const visibleInvoiceRows = invoiceGridRows.filter((gridRow) =>
    invoiceGridColumns.every((column) => {
      const query = columnQueries[column.id].trim().toLowerCase();
      const selection = columnSelections[column.id];
      const value = gridRow.values[column.id];
      return (!query || value.toLowerCase().includes(query)) && (!selection || selection.includes(value));
    }),
  );
  const totalAmount = visibleInvoiceRows.reduce((sum, gridRow) => sum + gridRow.row.invoice.amount, 0);
  const invoiceTableWidth = invoiceColumnWidths?.reduce((sum, width) => sum + width, 0) ?? 1095;

  useEffect(() => {
    if (!activeFilterColumn) return;
    const closeFilterPopover = (event: MouseEvent) => {
      if (!invoiceFilterPopoverRef.current?.contains(event.target as Node)) setActiveFilterColumn(null);
    };
    document.addEventListener("mousedown", closeFilterPopover);
    return () => document.removeEventListener("mousedown", closeFilterPopover);
  }, [activeFilterColumn]);

  useEffect(() => {
    if (!invoiceColumnWidths) return;
    try {
      window.localStorage.setItem(INVOICE_GRID_COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(invoiceColumnWidths));
    } catch {
      // 列宽记录失败不影响开票记录使用。
    }
  }, [invoiceColumnWidths]);

  function setInvoiceColumnQuery(columnId: InvoiceGridColumnId, value: string) {
    setColumnQueries((current) => ({ ...current, [columnId]: value }));
  }

  function setInvoiceColumnSelection(columnId: InvoiceGridColumnId, values: string[]) {
    setColumnSelections((current) => ({ ...current, [columnId]: values }));
  }

  function toggleInvoiceColumnValue(columnId: InvoiceGridColumnId, value: string) {
    const allValues = invoiceColumnValues[columnId];
    setColumnSelections((current) => {
      const selectedValues = new Set(current[columnId] ?? allValues);
      if (selectedValues.has(value)) selectedValues.delete(value);
      else selectedValues.add(value);
      return { ...current, [columnId]: Array.from(selectedValues) };
    });
  }

  function clearInvoiceColumnFilter(columnId: InvoiceGridColumnId) {
    setInvoiceColumnQuery(columnId, "");
    setColumnSelections((current) => {
      const { [columnId]: _discarded, ...remaining } = current;
      return remaining;
    });
    setFilterValueSearch("");
  }
  async function importInvoiceFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const result = await readInvoiceImportFile(file);
      props.onImport(result.rows, result.warnings);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "开票记录导入失败，请检查 Excel 文件。");
    }
  }

  return (
    <section className="recon-simple-panel records-fill-page invoice-records-page">
      <div className="recon-panel-head invoice-records-head">
        <div className="module-filter-grid invoice-records-filter-grid">
          <label>
            客户
            <SearchableSelect
              ariaLabel="客户"
              emptyText="无匹配客户"
              onChange={setCustomerId}
              options={[{ label: "全部客户", value: "" }, ...props.customers.map((customer) => ({ label: customer.name, value: customer.id }))]}
              placeholder="全部客户"
              value={customerId}
            />
          </label>
          <label>
            开票月份
            <AnimatedSelect
              ariaLabel="开票月份"
              onChange={setPeriodMonth}
              options={[{ label: "全部月份", value: "" }, ...toSelectOptions(periodOptions)]}
              value={periodMonth}
            />
          </label>
          <label>
            款号
            <input onChange={(event) => setStyleKeyword(event.target.value)} placeholder="输入款号" value={styleKeyword} />
          </label>
          <label>
            发票号 / 备注
            <input onChange={(event) => setInvoiceKeyword(event.target.value)} placeholder="输入关键词" value={invoiceKeyword} />
          </label>
          <button
            className="recon-button recon-button-light"
            onClick={() => {
              setCustomerId("");
              setPeriodMonth("");
              setStyleKeyword("");
              setInvoiceKeyword("");
              setColumnQueries(createSpreadsheetColumnQueries(invoiceGridColumns));
              setColumnSelections({});
              setActiveFilterColumn(null);
            }}
            type="button"
          >
            重置
          </button>
        </div>
        <label className="recon-button recon-button-primary payment-import-trigger">
          <Upload size={16} />
          导入开票
          <input accept=".xlsx,.csv" onChange={importInvoiceFile} type="file" />
        </label>
      </div>
      <div className="receipt-grid-scroll invoice-grid-scroll">
        <table
          className="recon-table recon-table-stable receipt-grid-table invoice-grid-table"
          ref={invoiceTableRef}
          style={{ minWidth: "100%", width: invoiceColumnWidths ? `${invoiceTableWidth}px` : "100%" }}
        >
          <colgroup>
            {invoiceGridColumns.map((column, index) => (
              <col key={column.id} style={{ width: invoiceColumnWidths ? `${invoiceColumnWidths[index]}px` : column.width }} />
            ))}
          </colgroup>
          <SpreadsheetGridHeader
            activeFilterColumn={activeFilterColumn}
            columnQueries={columnQueries}
            columnSelections={columnSelections}
            columnValues={invoiceColumnValues}
            columns={invoiceGridColumns}
            filterPopoverRef={invoiceFilterPopoverRef}
            filterValueSearch={filterValueSearch}
            onBeginResize={(columnIndex, event) =>
              beginSpreadsheetColumnResize(
                invoiceTableRef.current,
                invoiceColumnWidths,
                invoiceGridColumns.map((column) => column.minWidth),
                columnIndex,
                event,
                setInvoiceColumnWidths,
              )
            }
            onClearColumnFilter={clearInvoiceColumnFilter}
            onColumnQueryChange={setInvoiceColumnQuery}
            onColumnSelectionChange={setInvoiceColumnSelection}
            onFilterValueSearchChange={setFilterValueSearch}
            onToggleColumnFilter={(columnId) => {
              setActiveFilterColumn((current) => (current === columnId ? null : columnId));
              setFilterValueSearch("");
            }}
            onToggleColumnValue={toggleInvoiceColumnValue}
          />
          <tbody>
            {visibleInvoiceRows.map(({ row: { customer, invoice, styleNos } }) => (
              <tr key={invoice.id}>
                <td>{customer?.name ?? "-"}</td>
                <td>{styleNos.length > 0 ? styleNos.join("、") : "未分配"}</td>
                <td>{invoice.invoiceDate}</td>
                <td>{invoice.invoiceNo || "-"}</td>
                <td>¥ {formatMoney(invoice.amount)}</td>
                <td>{invoice.note || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="receipt-grid-summary invoice-grid-summary" aria-label="当前开票合计">
        <strong>当前合计</strong>
        <div>
          <span>开票金额 <b>¥ {formatMoney(totalAmount)}</b></span>
        </div>
      </footer>
    </section>
  );
}

function MasterDataModule(props: { customers: Customer[]; onAdd(): void; onEdit(customer: Customer): void }) {
  return (
    <section className="recon-simple-panel">
      <div className="recon-panel-head">
        <div>
          <span>客户基础资料</span>
          <strong>{props.customers.length} 个客户</strong>
        </div>
        <button className="recon-button recon-button-primary" onClick={props.onAdd} type="button">
          <UserPlus size={16} />
          新增客户
        </button>
      </div>
      <table className="recon-table">
        <thead>
          <tr>
            <th>客户名称</th>
            <th>联系人</th>
            <th>备注</th>
            <th>创建日期</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {props.customers.map((customer) => (
            <tr key={customer.id}>
              <td>{customer.name}</td>
              <td>{customer.contact || "-"}</td>
              <td>{customer.remark || "-"}</td>
              <td>{customer.createdAt}</td>
              <td>
                <button className="recon-inline-action" onClick={() => props.onEdit(customer)} type="button">
                  编辑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CustomerModal(props: {
  customer?: Customer;
  onClose(): void;
  onSubmit(values: Pick<Customer, "name" | "contact" | "remark">): void;
}) {
  const [name, setName] = useState(props.customer?.name ?? "");
  const [contact, setContact] = useState(props.customer?.contact ?? "");
  const [remark, setRemark] = useState(props.customer?.remark ?? "");

  return (
    <Modal onClose={props.onClose} title={props.customer ? "编辑客户" : "新增客户"}>
      <form
        className="recon-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          props.onSubmit({ name: name.trim(), contact: contact.trim(), remark: remark.trim() });
        }}
      >
        <Field label="客户名称" required>
          <input onChange={(event) => setName(event.target.value)} placeholder="例如：厚森服饰" value={name} />
        </Field>
        <Field label="联系人">
          <input onChange={(event) => setContact(event.target.value)} placeholder="联系人或对账人" value={contact} />
        </Field>
        <Field label="备注">
          <textarea onChange={(event) => setRemark(event.target.value)} placeholder="客户账期、开票偏好等" value={remark} />
        </Field>
        <ModalActions onClose={props.onClose} submitLabel="保存客户" />
      </form>
    </Modal>
  );
}

function StatementConfirmModal(props: {
  onClose(): void;
  onSubmit(values: { confirmedAt: string; confirmationMethod: import("./models").ConfirmationMethod; confirmedBy: string; confirmationNote: string }): void;
}) {
  const [confirmedAt, setConfirmedAt] = useState(getTodayString());
  const [confirmationMethod, setConfirmationMethod] = useState<import("./models").ConfirmationMethod>("微信确认");
  const [confirmedBy, setConfirmedBy] = useState("");
  const [confirmationNote, setConfirmationNote] = useState("");

  return (
    <Modal onClose={props.onClose} title="确认客户对账">
      <form
        className="recon-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!confirmedAt) return;
          props.onSubmit({ confirmedAt, confirmationMethod, confirmedBy: confirmedBy.trim(), confirmationNote: confirmationNote.trim() });
        }}
      >
        <Field label="确认日期" required>
          <input onChange={(event) => setConfirmedAt(event.target.value)} type="date" value={confirmedAt} />
        </Field>
        <Field label="确认方式" required>
          <AnimatedSelect
            ariaLabel="确认方式"
            onChange={(value) => setConfirmationMethod(value as import("./models").ConfirmationMethod)}
            options={toSelectOptions(confirmationMethodOptions)}
            value={confirmationMethod}
          />
        </Field>
        <Field label="确认人">
          <input onChange={(event) => setConfirmedBy(event.target.value)} placeholder="例如：张三 / 客户财务" value={confirmedBy} />
        </Field>
        <Field label="确认备注">
          <textarea onChange={(event) => setConfirmationNote(event.target.value)} placeholder="客户确认过程中的补充说明" value={confirmationNote} />
        </Field>
        <ModalActions onClose={props.onClose} submitLabel="确认" />
      </form>
    </Modal>
  );
}

function StatementUnconfirmModal(props: {
  onClose(): void;
  onSubmit(reason: string): void;
}) {
  const [reason, setReason] = useState("");

  return (
    <Modal onClose={props.onClose} title="反确认">
      <form
        className="recon-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!reason.trim()) return;
          props.onSubmit(reason.trim());
        }}
      >
        <Field label="反确认原因" required>
          <textarea
            onChange={(event) => setReason(event.target.value)}
            placeholder="例如：客户提出金额异议"
            value={reason}
          />
        </Field>
        <p className="recon-form-hint">反确认后月度对账单回到草稿状态，原确认记录会保留在确认信息中，可继续修改后再次确认（版本号 +1）。</p>
        <ModalActions onClose={props.onClose} submitLabel="确认反确认" />
      </form>
    </Modal>
  );
}

function StatementHistoryModal(props: { histories: StatementConfirmationHistory[]; onClose(): void }) {
  const sorted = [...props.histories].reverse();
  return (
    <Modal onClose={props.onClose} size="receiptPool" title="确认信息 / 历史记录">
      {sorted.length === 0 ? (
        <EmptyPanel text="该月度对账单还没有确认相关记录。" />
      ) : (
        <div className="recon-table-wrap">
          <table className="recon-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>操作</th>
                <th>版本</th>
                <th>状态流转</th>
                <th>当时未收金额</th>
                <th>操作人</th>
                <th>方式 / 原因</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((history) => (
                <tr key={history.id}>
                  <td>{history.occurredAt}</td>
                  <td>{statementHistoryActionLabels[history.action] ?? history.action}</td>
                  <td>V{history.version}</td>
                  <td>
                    {statementLifecycleLabels[history.statusBefore]} → {statementLifecycleLabels[history.statusAfter]}
                  </td>
                  <td>¥ {formatMoney(history.confirmedAmount)}</td>
                  <td>{history.operatorName}</td>
                  <td>
                    {history.method ? `${history.method} ` : ""}
                    {history.note || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function StatementModal(props: {
  customers: Customer[];
  defaultCustomerId: string;
  getDueDateSuggestion(customerId: string, periodMonth: string): string;
  getOpeningBalance(customerId: string, periodMonth: string): number;
  onClose(): void;
  onSubmit(values: { customerId: string; periodMonth: string; openingBalance: number; dueDate: string; note: string }): void;
}) {
  const initialCustomerId = props.customers.some((customer) => customer.id === props.defaultCustomerId)
    ? props.defaultCustomerId
    : props.customers[0]?.id || "";
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [periodMonth, setPeriodMonth] = useState(getCurrentPeriod());
  const [openingBalance, setOpeningBalance] = useState(() => String(props.getOpeningBalance(initialCustomerId, getCurrentPeriod())));
  const [dueDate, setDueDate] = useState(() => props.getDueDateSuggestion(initialCustomerId, getCurrentPeriod()));
  const [note, setNote] = useState("");

  function updatePeriod(nextCustomerId: string, nextPeriodMonth: string) {
    setCustomerId(nextCustomerId);
    setPeriodMonth(nextPeriodMonth);
    setOpeningBalance(String(props.getOpeningBalance(nextCustomerId, nextPeriodMonth)));
    setDueDate(props.getDueDateSuggestion(nextCustomerId, nextPeriodMonth));
  }

  return (
    <Modal onClose={props.onClose} title="新增月度对账单">
      <form
        className="recon-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!customerId || !periodMonth) return;
          props.onSubmit({
            customerId,
            periodMonth,
            openingBalance: parseMoney(openingBalance),
            dueDate: dueDate.trim(),
            note: note.trim(),
          });
        }}
      >
        <Field label="客户" required>
          <AnimatedSelect
            ariaLabel="客户"
            onChange={(value) => updatePeriod(value, periodMonth)}
            options={props.customers.map((customer) => ({ label: customer.name, value: customer.id }))}
            value={customerId}
          />
        </Field>
        <Field label="对账月份" required>
          <input onChange={(event) => updatePeriod(customerId, event.target.value)} type="month" value={periodMonth} />
        </Field>
        <Field label="期初余额">
          <input min="0" onChange={(event) => setOpeningBalance(event.target.value)} step="0.01" type="number" value={openingBalance} />
        </Field>
        <Field label="到期日">
          <input onChange={(event) => setDueDate(event.target.value)} title="按客户账期自动推荐，可手工修改" type="date" value={dueDate} />
        </Field>
        <Field label="备注">
          <textarea onChange={(event) => setNote(event.target.value)} placeholder="例如：自动结转上月余额" value={note} />
        </Field>
        <ModalActions onClose={props.onClose} submitLabel="保存月度单" />
      </form>
    </Modal>
  );
}

function StatementItemModal(props: {
  customerId: string;
  item?: StatementItem;
  onClose(): void;
  onSubmit(values: { statementId: string; customerId: string; styleNo: string; receivableAmount: number; note: string }): void;
  statementId: string;
  statements: MonthlyStatement[];
  styleAccount?: StyleAccount;
}) {
  const [statementId, setStatementId] = useState(props.item?.statementId ?? props.statementId);
  const [styleNo, setStyleNo] = useState(props.styleAccount?.styleNo ?? "");
  const [amount, setAmount] = useState(props.item ? String(props.item.receivableAmount) : "");
  const [note, setNote] = useState(props.item?.note ?? "");

  return (
    <Modal onClose={props.onClose} title={props.item ? "编辑款号应收" : "新增款号应收"}>
      <form
        className="recon-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!styleNo.trim()) return;
          props.onSubmit({
            statementId,
            customerId: props.customerId,
            styleNo: styleNo.trim(),
            receivableAmount: parseMoney(amount),
            note: note.trim(),
          });
        }}
      >
        <Field label="归属月份 / 月度对账单" required>
          <AnimatedSelect
            ariaLabel="归属月份 / 月度对账单"
            onChange={setStatementId}
            options={props.statements.map((statement) => ({ label: `${statement.periodMonth} / ${statement.status}`, value: statement.id }))}
            value={statementId}
          />
        </Field>
        <Field label="款号" required>
          <input onChange={(event) => setStyleNo(event.target.value)} placeholder="输入款号" value={styleNo} />
        </Field>
        <Field label="应收金额">
          <input min="0" onChange={(event) => setAmount(event.target.value)} step="0.01" type="number" value={amount} />
        </Field>
        <Field label="备注">
          <textarea onChange={(event) => setNote(event.target.value)} value={note} />
        </Field>
        <ModalActions onClose={props.onClose} submitLabel="保存应收" />
      </form>
    </Modal>
  );
}

function InvoiceModal(props: {
  onClose(): void;
  onSubmit(record: InvoiceRecord): void;
  periodMonth: string;
  record?: InvoiceRecord;
}) {
  const [date, setDate] = useState(props.record?.date ?? `${props.periodMonth}-01`);
  const [invoiceNo, setInvoiceNo] = useState(props.record?.invoiceNo ?? "");
  const [amount, setAmount] = useState(props.record ? String(props.record.amount) : "");
  const [remark, setRemark] = useState(props.record?.remark ?? "");

  return (
    <Modal onClose={props.onClose} title={props.record ? "编辑开票记录" : "新增开票记录"}>
      <form
        className="recon-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!invoiceNo.trim()) return;
          props.onSubmit({
            id: props.record?.id ?? createId("inv"),
            date,
            invoiceNo: invoiceNo.trim(),
            amount: parseMoney(amount),
            remark: remark.trim(),
          });
        }}
      >
        <Field label="开票日期">
          <input onChange={(event) => setDate(event.target.value)} type="date" value={date} />
        </Field>
        <Field label="发票号码" required>
          <input onChange={(event) => setInvoiceNo(event.target.value)} placeholder="输入发票号码" value={invoiceNo} />
        </Field>
        <Field label="开票金额">
          <input min="0" onChange={(event) => setAmount(event.target.value)} step="0.01" type="number" value={amount} />
        </Field>
        <Field label="备注">
          <textarea onChange={(event) => setRemark(event.target.value)} value={remark} />
        </Field>
        <ModalActions onClose={props.onClose} submitLabel="保存开票" />
      </form>
    </Modal>
  );
}

type ReceiptPoolRow = {
  id: string;
  receiptDate: string;
  amount: string;
  method: PaymentMethod;
  isLocked: boolean;
  transactionNo: string;
  note: string;
  createdAt?: string;
  isNew?: boolean;
};

const RECEIPT_POOL_PAGE_SIZE = 10;

function ReceiptPoolModal(props: {
  allocations: ReceiptAllocation[];
  customer?: Customer;
  onClose(): void;
  onSubmitAllocation(allocation: ReceiptAllocation | ReceiptAllocation[]): void;
  onSave(receipts: CustomerReceipt[], deletedReceiptIds: string[]): void;
  receipts: CustomerReceipt[];
  statements: MonthlyStatement[];
  store: Parameters<typeof summarizeStatement>[1];
}) {
  const [rows, setRows] = useState<ReceiptPoolRow[]>(() =>
    props.receipts.map((receipt) => ({
      id: receipt.id,
      receiptDate: receipt.receiptDate,
      amount: receipt.amount.toFixed(2),
      method: receipt.method,
      isLocked: receipt.isLocked === true,
      transactionNo: receipt.transactionNo ?? "",
      note: receipt.note ?? "",
      createdAt: receipt.createdAt,
    })),
  );
  const [deletedReceiptIds, setDeletedReceiptIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    allocatedAmount?: number;
    rowId: string;
    type: "delete" | "unlock";
  }>();
  const [allocationReceiptId, setAllocationReceiptId] = useState<string>();
  const pageCount = Math.max(1, Math.ceil(rows.length / RECEIPT_POOL_PAGE_SIZE));
  const visibleRows = useMemo(
    () =>
      [...rows]
        .sort((left, right) => left.receiptDate.localeCompare(right.receiptDate))
        .slice((currentPage - 1) * RECEIPT_POOL_PAGE_SIZE, currentPage * RECEIPT_POOL_PAGE_SIZE),
    [currentPage, rows],
  );

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount));
  }, [pageCount]);

  function updateRow(rowId: string, patch: Partial<ReceiptPoolRow>) {
    setRows((currentRows) => currentRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((currentRows) => {
      const nextRows = [
        ...currentRows,
        {
          id: createId("receipt"),
          receiptDate: getTodayString(),
          amount: "",
          method: "银行转账" as PaymentMethod,
          isLocked: false,
          transactionNo: "",
          note: "",
          isNew: true,
        },
      ];
      setCurrentPage(Math.ceil(nextRows.length / RECEIPT_POOL_PAGE_SIZE));
      return nextRows;
    });
  }

  function deleteRow(row: ReceiptPoolRow) {
    if (row.isLocked) return;
    const allocatedAmount = getReceiptAllocatedAmount(row.id, props.allocations);
    setPendingConfirmation({ allocatedAmount, rowId: row.id, type: "delete" });
  }

  function toggleRowLock(row: ReceiptPoolRow) {
    if (row.isLocked) {
      setPendingConfirmation({ rowId: row.id, type: "unlock" });
      return;
    }
    updateRow(row.id, { isLocked: true });
  }

  function confirmPendingAction() {
    if (!pendingConfirmation) return;
    const row = rows.find((item) => item.id === pendingConfirmation.rowId);
    if (!row) {
      setPendingConfirmation(undefined);
      return;
    }

    if (pendingConfirmation.type === "unlock") {
      updateRow(row.id, { isLocked: false });
    } else if (!row.isLocked) {
      setRows((currentRows) => currentRows.filter((item) => item.id !== row.id));
      if (!row.isNew) {
        setDeletedReceiptIds((currentIds) => [...currentIds, row.id]);
      }
    }
    setPendingConfirmation(undefined);
  }

  function saveRows() {
    if (!props.customer) return;
    const today = getTodayString();
    const nextReceipts: CustomerReceipt[] = [];

    for (const [rowIndex, row] of rows.entries()) {
      const amount = parseMoney(row.amount);
      const allocatedAmount = getReceiptAllocatedAmount(row.id, props.allocations);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.receiptDate)) {
        setCurrentPage(Math.floor(rowIndex / RECEIPT_POOL_PAGE_SIZE) + 1);
        setError("收款日期必须使用 YYYY-MM-DD 格式。");
        return;
      }
      if (!row.amount.trim() || amount <= 0) {
        setCurrentPage(Math.floor(rowIndex / RECEIPT_POOL_PAGE_SIZE) + 1);
        setError("收款金额不能为空，且必须大于 0。");
        return;
      }
      if (amount < allocatedAmount) {
        setCurrentPage(Math.floor(rowIndex / RECEIPT_POOL_PAGE_SIZE) + 1);
        setError("已有分配记录的收款，修改后的收款金额不能小于已分配金额。");
        return;
      }

      nextReceipts.push({
        id: row.id,
        customerId: props.customer.id,
        receiptDate: row.receiptDate,
        amount,
        method: row.method,
        isLocked: row.isLocked,
        transactionNo: row.transactionNo.trim(),
        note: row.note.trim(),
        createdAt: row.createdAt ?? today,
        updatedAt: today,
      });
    }

    setError("");
    props.onSave(nextReceipts, deletedReceiptIds);
  }

  return (
    <>
      <Modal onClose={props.onClose} size="receiptPool" title="收款池">
      <div className="receipt-pool">
        <div className="receipt-pool__customer">
          客户：<strong>{props.customer?.name ?? "未选择客户"}</strong>
        </div>
        <div className="receipt-pool__table-wrap">
          <table className="receipt-pool-table">
            <thead>
              <tr>
                <th>收款日期</th>
                <th>收款金额</th>
                <th>收款方式</th>
                <th>流水号 / 承兑编号</th>
                <th>已核销</th>
                <th>未核销</th>
                <th>核销状态</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const allocatedAmount = getReceiptAllocatedAmount(row.id, props.allocations);
                const amount = parseMoney(row.amount);
                return (
                  <tr className={row.isLocked ? "is-locked" : undefined} key={row.id}>
                    <td>
                      <input
                        disabled={row.isLocked}
                        onChange={(event) => updateRow(row.id, { receiptDate: event.target.value })}
                        type="date"
                        value={row.receiptDate}
                      />
                    </td>
                    <td>
                      <input
                        disabled={row.isLocked}
                        min="0"
                        onChange={(event) => updateRow(row.id, { amount: event.target.value })}
                        step="0.01"
                        type="number"
                        value={row.amount}
                      />
                    </td>
                    <td>
                      <AnimatedSelect
                        ariaLabel="收款方式"
                        disabled={row.isLocked}
                        onChange={(value) => updateRow(row.id, { method: value as PaymentMethod })}
                        options={toSelectOptions(paymentMethods)}
                        value={row.method}
                      />
                    </td>
                    <td>
                      <input
                        disabled={row.isLocked}
                        onChange={(event) => updateRow(row.id, { transactionNo: event.target.value })}
                        placeholder="银行流水号/承兑编号"
                        value={row.transactionNo}
                      />
                    </td>
                    <td>
                      ¥ {formatMoney(allocatedAmount)}
                    </td>
                    <td className={amount - allocatedAmount > 0 ? "is-danger" : "is-ok"}>
                      ¥ {formatMoney(amount - allocatedAmount)}
                    </td>
                    <td>
                      <span className={`settlement-status is-${amount - allocatedAmount <= 0 ? "allocated" : allocatedAmount > 0 ? "partial" : "unallocated"}`}>
                        {amount - allocatedAmount <= 0 ? "已核销" : allocatedAmount > 0 ? "部分核销" : "未核销"}
                      </span>
                    </td>
                    <td>
                      <input disabled={row.isLocked} onChange={(event) => updateRow(row.id, { note: event.target.value })} value={row.note} />
                    </td>
                    <td>
                      <div className="receipt-pool-actions">
                        <button
                          aria-label="收款核销"
                          className="receipt-pool-icon-action is-allocate"
                          disabled={row.isLocked || row.isNew || amount <= allocatedAmount}
                          onClick={() => setAllocationReceiptId(row.id)}
                          title={row.isNew ? "请先保存收款后再核销" : row.isLocked ? "该收款已锁定" : "收款核销"}
                          type="button"
                        >
                          <Network size={16} />
                        </button>
                        <button
                          aria-label="删除收款"
                          className="receipt-pool-icon-action is-delete"
                          disabled={row.isLocked}
                          onClick={() => deleteRow(row)}
                          title={row.isLocked ? "该收款已锁定" : "删除收款"}
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>
                        <button
                          aria-label={row.isLocked ? "解锁收款" : "锁定收款"}
                          aria-pressed={row.isLocked}
                          className={`receipt-pool-icon-action ${row.isLocked ? "is-lock-closed" : "is-lock-open"}`}
                          onClick={() => toggleRowLock(row)}
                          title={row.isLocked ? "解锁收款" : "锁定收款"}
                          type="button"
                        >
                          {row.isLocked ? <Lock size={16} /> : <LockOpen size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyPanel text="当前客户暂无收款记录，可点击新增一行录入。" />}
        </div>
        <div className="receipt-pool__below">
          <div className="receipt-pool__below-actions">
            <button className="recon-button recon-button-light" onClick={addRow} type="button">
              <Plus size={16} />
              新增一行
            </button>
            <span className="receipt-pool__count">共 {rows.length} 笔收款</span>
          </div>
          {error && <span className="receipt-pool__error">{error}</span>}
          <div className="receipt-pool__pagination" aria-label="收款池分页">
            <button
              aria-label="上一页"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              title="上一页"
              type="button"
            >
              <ChevronLeft size={17} />
            </button>
            <span>
              第 {currentPage} / {pageCount} 页
            </span>
            <button
              aria-label="下一页"
              disabled={currentPage >= pageCount}
              onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
              title="下一页"
              type="button"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
        <div className="receipt-pool__footer">
          <button className="recon-button recon-button-light" onClick={props.onClose} type="button">
            取消
          </button>
          <button className="recon-button recon-button-primary" onClick={saveRows} type="button">
            保存
          </button>
        </div>
      </div>
      </Modal>
      {allocationReceiptId && props.customer && (() => {
        const receipt = props.receipts.find((item) => item.id === allocationReceiptId);
        if (!receipt) return null;
        return (
          <SettlementModal
            allocations={props.allocations}
            customer={props.customer}
            receipt={receipt}
            store={props.store}
            onClose={() => setAllocationReceiptId(undefined)}
            onSubmitAllocation={(allocations) => {
              props.onSubmitAllocation(allocations);
              setAllocationReceiptId(undefined);
            }}
          />
        );
      })()}
      {pendingConfirmation && (
        <ConfirmationDialog
          confirmLabel={pendingConfirmation.type === "delete" ? "确认删除" : "确认解锁"}
          description={
            pendingConfirmation.type === "delete"
              ? pendingConfirmation.allocatedAmount && pendingConfirmation.allocatedAmount > 0
                ? "该收款已有分配记录，删除后会影响对账单和款号的收款结果。此操作将在保存收款池后生效。"
                : "删除后将无法在收款池中找到这笔记录。此操作将在保存收款池后生效。"
              : "解锁后，这笔收款可以继续修改或删除。"
          }
          onCancel={() => setPendingConfirmation(undefined)}
          onConfirm={confirmPendingAction}
          title={pendingConfirmation.type === "delete" ? "确认删除这笔收款？" : "确认解锁这笔收款？"}
          tone={pendingConfirmation.type === "delete" ? "danger" : "primary"}
        />
      )}
    </>
  );
}

type InvoicePoolRow = {
  id: string;
  invoiceDate: string;
  invoiceNo: string;
  amount: string;
  isLocked: boolean;
  note: string;
  createdAt?: string;
  isNew?: boolean;
};

function InvoicePoolModal(props: {
  allocations: InvoiceAllocation[];
  customer?: Customer;
  invoices: CustomerInvoice[];
  onClose(): void;
  onSubmitAllocation(allocation: InvoiceAllocation | InvoiceAllocation[]): void;
  onSave(invoices: CustomerInvoice[], deletedInvoiceIds: string[]): void;
  statements: MonthlyStatement[];
  store: Parameters<typeof summarizeStatement>[1];
}) {
  const [rows, setRows] = useState<InvoicePoolRow[]>(() =>
    props.invoices.map((invoice) => ({
      id: invoice.id,
      invoiceDate: invoice.invoiceDate,
      invoiceNo: invoice.invoiceNo,
      amount: invoice.amount.toFixed(2),
      isLocked: invoice.isLocked === true,
      note: invoice.note ?? "",
      createdAt: invoice.createdAt,
    })),
  );
  const [deletedInvoiceIds, setDeletedInvoiceIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingConfirmation, setPendingConfirmation] = useState<{ allocatedAmount?: number; rowId: string; type: "delete" | "unlock" }>();
  const [allocationInvoiceId, setAllocationInvoiceId] = useState<string>();
  const pageCount = Math.max(1, Math.ceil(rows.length / RECEIPT_POOL_PAGE_SIZE));
  const visibleRows = useMemo(
    () =>
      [...rows]
        .sort((left, right) => left.invoiceDate.localeCompare(right.invoiceDate))
        .slice((currentPage - 1) * RECEIPT_POOL_PAGE_SIZE, currentPage * RECEIPT_POOL_PAGE_SIZE),
    [currentPage, rows],
  );

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount));
  }, [pageCount]);

  function updateRow(rowId: string, patch: Partial<InvoicePoolRow>) {
    setRows((currentRows) => currentRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((currentRows) => {
      const nextRows = [
        ...currentRows,
        {
          id: createId("invoice"),
          invoiceDate: getTodayString(),
          invoiceNo: "",
          amount: "",
          isLocked: false,
          note: "",
          isNew: true,
        },
      ];
      setCurrentPage(Math.ceil(nextRows.length / RECEIPT_POOL_PAGE_SIZE));
      return nextRows;
    });
  }

  function deleteRow(row: InvoicePoolRow) {
    if (row.isLocked) return;
    setPendingConfirmation({ allocatedAmount: getInvoiceAllocatedAmount(row.id, props.allocations), rowId: row.id, type: "delete" });
  }

  function toggleRowLock(row: InvoicePoolRow) {
    if (row.isLocked) {
      setPendingConfirmation({ rowId: row.id, type: "unlock" });
      return;
    }
    updateRow(row.id, { isLocked: true });
  }

  function confirmPendingAction() {
    if (!pendingConfirmation) return;
    const row = rows.find((item) => item.id === pendingConfirmation.rowId);
    if (!row) {
      setPendingConfirmation(undefined);
      return;
    }
    if (pendingConfirmation.type === "unlock") {
      updateRow(row.id, { isLocked: false });
    } else if (!row.isLocked) {
      setRows((currentRows) => currentRows.filter((item) => item.id !== row.id));
      if (!row.isNew) setDeletedInvoiceIds((currentIds) => [...currentIds, row.id]);
    }
    setPendingConfirmation(undefined);
  }

  function saveRows() {
    if (!props.customer) return;
    const today = getTodayString();
    const nextInvoices: CustomerInvoice[] = [];
    for (const [rowIndex, row] of rows.entries()) {
      const amount = parseMoney(row.amount);
      const allocatedAmount = getInvoiceAllocatedAmount(row.id, props.allocations);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.invoiceDate)) {
        setCurrentPage(Math.floor(rowIndex / RECEIPT_POOL_PAGE_SIZE) + 1);
        setError("开票日期必须使用 YYYY-MM-DD 格式。");
        return;
      }
      if (!row.amount.trim() || amount <= 0) {
        setCurrentPage(Math.floor(rowIndex / RECEIPT_POOL_PAGE_SIZE) + 1);
        setError("开票金额不能为空，且必须大于 0。");
        return;
      }
      if (amount < allocatedAmount) {
        setCurrentPage(Math.floor(rowIndex / RECEIPT_POOL_PAGE_SIZE) + 1);
        setError("已有分配记录的开票，修改后的开票金额不能小于已分配金额。");
        return;
      }
      nextInvoices.push({
        id: row.id,
        customerId: props.customer.id,
        invoiceDate: row.invoiceDate,
        invoiceNo: row.invoiceNo.trim(),
        amount,
        isLocked: row.isLocked,
        note: row.note.trim(),
        createdAt: row.createdAt ?? today,
        updatedAt: today,
      });
    }
    setError("");
    props.onSave(nextInvoices, deletedInvoiceIds);
  }

  return (
    <>
      <Modal onClose={props.onClose} size="receiptPool" title="开票池">
        <div className="receipt-pool invoice-pool">
          <div className="receipt-pool__customer">
            客户：<strong>{props.customer?.name ?? "未选择客户"}</strong>
          </div>
          <div className="receipt-pool__table-wrap">
            <table className="receipt-pool-table invoice-pool-table">
              <thead>
                <tr>
                  <th>开票日期</th>
                  <th>发票号码</th>
                  <th>开票金额</th>
                  <th>已分配金额</th>
                  <th>未分配金额</th>
                  <th>备注</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const allocatedAmount = getInvoiceAllocatedAmount(row.id, props.allocations);
                  const amount = parseMoney(row.amount);
                  return (
                    <tr className={row.isLocked ? "is-locked" : undefined} key={row.id}>
                      <td><input disabled={row.isLocked} onChange={(event) => updateRow(row.id, { invoiceDate: event.target.value })} type="date" value={row.invoiceDate} /></td>
                      <td><input disabled={row.isLocked} onChange={(event) => updateRow(row.id, { invoiceNo: event.target.value })} placeholder="发票号码" value={row.invoiceNo} /></td>
                      <td><input disabled={row.isLocked} min="0" onChange={(event) => updateRow(row.id, { amount: event.target.value })} step="0.01" type="number" value={row.amount} /></td>
                      <td>¥ {formatMoney(allocatedAmount)}</td>
                      <td className={amount - allocatedAmount > 0 ? "is-danger" : "is-ok"}>¥ {formatMoney(amount - allocatedAmount)}</td>
                      <td><input disabled={row.isLocked} onChange={(event) => updateRow(row.id, { note: event.target.value })} value={row.note} /></td>
                      <td>
                        <div className="receipt-pool-actions">
                          <button aria-label="分配开票" className="receipt-pool-icon-action is-allocate" disabled={row.isLocked || row.isNew || amount <= allocatedAmount} onClick={() => setAllocationInvoiceId(row.id)} title={row.isNew ? "请先保存开票后再分配" : row.isLocked ? "该开票已锁定" : "开票分配"} type="button"><Network size={16} /></button>
                          <button aria-label="删除开票" className="receipt-pool-icon-action is-delete" disabled={row.isLocked} onClick={() => deleteRow(row)} title={row.isLocked ? "该开票已锁定" : "删除开票"} type="button"><Trash2 size={16} /></button>
                          <button aria-label={row.isLocked ? "解锁开票" : "锁定开票"} aria-pressed={row.isLocked} className={`receipt-pool-icon-action ${row.isLocked ? "is-lock-closed" : "is-lock-open"}`} onClick={() => toggleRowLock(row)} title={row.isLocked ? "解锁开票" : "锁定开票"} type="button">{row.isLocked ? <Lock size={16} /> : <LockOpen size={16} />}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && <EmptyPanel text="当前客户暂无开票记录，可点击新增一行录入。" />}
          </div>
          <div className="receipt-pool__below">
            <div className="receipt-pool__below-actions">
              <button className="recon-button recon-button-light" onClick={addRow} type="button"><Plus size={16} />新增一行</button>
              <span className="receipt-pool__count">共 {rows.length} 笔开票</span>
            </div>
            {error && <span className="receipt-pool__error">{error}</span>}
            <div className="receipt-pool__pagination" aria-label="开票池分页">
              <button aria-label="上一页" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} type="button"><ChevronLeft size={17} /></button>
              <span>第 {currentPage} / {pageCount} 页</span>
              <button aria-label="下一页" disabled={currentPage >= pageCount} onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))} type="button"><ChevronRight size={17} /></button>
            </div>
          </div>
          <div className="receipt-pool__footer">
            <button className="recon-button recon-button-light" onClick={props.onClose} type="button">取消</button>
            <button className="recon-button recon-button-primary" onClick={saveRows} type="button">保存</button>
          </div>
        </div>
      </Modal>
      {allocationInvoiceId && props.customer && (
        <InvoiceAllocationModal
          customerId={props.customer.id}
          defaultInvoiceId={allocationInvoiceId}
          invoiceAllocations={props.allocations}
          invoices={props.invoices}
          statements={props.statements}
          store={props.store}
          onClose={() => setAllocationInvoiceId(undefined)}
          onSubmit={(allocation) => {
            props.onSubmitAllocation(allocation);
            setAllocationInvoiceId(undefined);
          }}
        />
      )}
      {pendingConfirmation && (
        <ConfirmationDialog
          confirmLabel={pendingConfirmation.type === "delete" ? "确认删除" : "确认解锁"}
          description={pendingConfirmation.type === "delete" ? pendingConfirmation.allocatedAmount && pendingConfirmation.allocatedAmount > 0 ? "该开票已有分配记录，删除后会影响对账单和款号的开票结果。此操作将在保存开票池后生效。" : "删除后将无法在开票池中找到这笔开票。此操作将在保存开票池后生效。" : "解锁后，这笔开票可以继续修改或删除。"}
          onCancel={() => setPendingConfirmation(undefined)}
          onConfirm={confirmPendingAction}
          title={pendingConfirmation.type === "delete" ? "确认删除这笔开票？" : "确认解锁这笔开票？"}
          tone={pendingConfirmation.type === "delete" ? "danger" : "primary"}
        />
      )}
    </>
  );
}

function InvoiceAllocationModal(props: {
  customerId: string;
  defaultInvoiceId?: string;
  defaultStatementId?: string;
  invoiceAllocations: InvoiceAllocation[];
  invoices: CustomerInvoice[];
  statements: MonthlyStatement[];
  store: Parameters<typeof summarizeStatement>[1];
  onClose(): void;
  onSubmit(allocation: InvoiceAllocation | InvoiceAllocation[]): void;
}) {
  const customerInvoices = props.invoices.filter((invoice) => invoice.customerId === props.customerId);
  const customerStatements = props.statements.filter((statement) => statement.customerId === props.customerId);
  const [invoiceId, setInvoiceId] = useState(props.defaultInvoiceId ?? customerInvoices[0]?.id ?? "");
  const [statementId, setStatementId] = useState(props.defaultStatementId ?? customerStatements[0]?.id ?? "");
  const statementSummary = customerStatements.find((statement) => statement.id === statementId)
    ? summarizeStatement(customerStatements.find((statement) => statement.id === statementId)!, props.store)
    : null;
  const [styleAccountId, setStyleAccountId] = useState("");
  const selectedInvoice = customerInvoices.find((invoice) => invoice.id === invoiceId);
  const remainingAmount = selectedInvoice ? roundMoney(selectedInvoice.amount - getInvoiceAllocatedAmount(selectedInvoice.id, props.invoiceAllocations)) : 0;
  const selectedItemSummary = statementSummary?.items.find((item) => item.item.styleAccountId === styleAccountId);
  const statementUninvoicedTotal = sumMoney((statementSummary?.items ?? []).map((item) => Math.max(item.receivableAmount - item.invoicedAmount, 0)));
  const maxAssignableAmount = styleAccountId
    ? roundMoney(Math.min(remainingAmount, Math.max((selectedItemSummary?.receivableAmount ?? 0) - (selectedItemSummary?.invoicedAmount ?? 0), 0)))
    : roundMoney(Math.min(remainingAmount, statementUninvoicedTotal));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  function buildAllocations() {
    if (!invoiceId || !statementId) return [];
    let pendingAmount = roundMoney(Math.min(parseMoney(amount), remainingAmount));
    if (pendingAmount <= 0) return [];
    if (styleAccountId) {
      const available = Math.max((selectedItemSummary?.receivableAmount ?? 0) - (selectedItemSummary?.invoicedAmount ?? 0), 0);
      const allocatedAmount = roundMoney(Math.min(pendingAmount, available));
      return allocatedAmount > 0 ? [{ id: createId("invoice-alloc"), invoiceId, customerId: props.customerId, statementId, styleAccountId, allocatedAmount, note: note.trim() }] : [];
    }
    const allocations: InvoiceAllocation[] = [];
    for (const item of statementSummary?.items ?? []) {
      if (pendingAmount <= 0) break;
      const available = roundMoney(Math.max(item.receivableAmount - item.invoicedAmount, 0));
      if (available <= 0) continue;
      const allocatedAmount = roundMoney(Math.min(pendingAmount, available));
      allocations.push({ id: createId("invoice-alloc"), invoiceId, customerId: props.customerId, statementId, styleAccountId: item.item.styleAccountId, allocatedAmount, note: note.trim() || "自动分配到整张月度对账单" });
      pendingAmount = roundMoney(pendingAmount - allocatedAmount);
    }
    return allocations;
  }

  return (
    <Modal onClose={props.onClose} title="开票分配">
      <form className="recon-form" onSubmit={(event) => {
        event.preventDefault();
        const allocations = buildAllocations();
        if (allocations.length === 0) {
          window.alert("没有可分配金额，请检查开票未分配金额或款号未开票金额。");
          return;
        }
        props.onSubmit(allocations);
      }}>
        <Field label="客户开票" required>
          <AnimatedSelect ariaLabel="客户开票" onChange={setInvoiceId} options={customerInvoices.map((invoice) => {
            const allocated = getInvoiceAllocatedAmount(invoice.id, props.invoiceAllocations);
            return { label: `${invoice.invoiceDate} / ${invoice.invoiceNo || "无发票号"} / ¥ ${formatMoney(invoice.amount)} / 未分配 ¥ ${formatMoney(invoice.amount - allocated)}`, value: invoice.id };
          })} value={invoiceId} />
        </Field>
        <Field label="分配到月度对账单" required>
          <AnimatedSelect ariaLabel="分配到月度对账单" onChange={(value) => { setStatementId(value); setStyleAccountId(""); }} options={customerStatements.map((statement) => ({ label: `${statement.periodMonth} / ${statement.status}`, value: statement.id }))} value={statementId} />
        </Field>
        <Field label="分配方式">
          <AnimatedSelect ariaLabel="分配方式" onChange={setStyleAccountId} options={[{ label: "自动分配到整张月度对账单", value: "" }, ...(statementSummary?.items.map((item) => ({ label: `${item.styleAccount?.styleNo ?? "-"} / 未开票 ¥ ${formatMoney(Math.max(item.receivableAmount - item.invoicedAmount, 0))}`, value: item.item.styleAccountId })) ?? [])]} value={styleAccountId} />
        </Field>
        <Field label="分配金额">
          <>
            <div className="allocation-amount-row"><input min="0" onChange={(event) => setAmount(event.target.value)} placeholder={`最多可分配 ¥ ${formatMoney(maxAssignableAmount)}`} step="0.01" type="number" value={amount} /><button className="recon-button recon-button-light" onClick={() => setAmount(maxAssignableAmount.toFixed(2))} type="button">一键最大</button></div>
            <small>开票未分配 ¥ {formatMoney(remainingAmount)} / 本月款号未开票 ¥ {formatMoney(statementUninvoicedTotal)}</small>
          </>
        </Field>
        <Field label="备注"><textarea onChange={(event) => setNote(event.target.value)} value={note} /></Field>
        <ModalActions onClose={props.onClose} submitLabel="保存分配" />
      </form>
    </Modal>
  );
}

function SettlementModal(props: {
  allocations: ReceiptAllocation[];
  customer?: Customer;
  onClose(): void;
  onSubmitAllocation(allocations: ReceiptAllocation | ReceiptAllocation[]): void;
  receipt: CustomerReceipt;
  store: Parameters<typeof summarizeStatement>[1];
}) {
  const settlement = getReceiptSettlementInfo(props.receipt, props.allocations);
  const statementRows = props.store.monthlyStatements
    .filter((statement) => statement.customerId === props.receipt.customerId)
    .sort((left, right) => left.periodMonth.localeCompare(right.periodMonth))
    .map((statement) => ({ summary: summarizeStatement(statement, props.store), dueInfo: getStatementDueInfo(statement, props.store) }));
  const openRows = statementRows.filter(({ summary }) => summary.closingBalance > 0);
  const [amountInputs, setAmountInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const pendingTotal = sumMoney(Object.values(amountInputs).map((value) => parseMoney(value)));
  const remaining = roundMoney(settlement.unallocatedAmount - pendingTotal);

  function setRowAmount(statementId: string, value: string) {
    setAmountInputs((current) => ({ ...current, [statementId]: value }));
    setError("");
  }

  function autoAllocate() {
    let pool = settlement.unallocatedAmount;
    const nextInputs: Record<string, string> = {};
    [...openRows]
      .sort((left, right) => {
        const leftKey = left.dueInfo.dueDate || `${left.summary.statement.periodMonth}-01`;
        const rightKey = right.dueInfo.dueDate || `${right.summary.statement.periodMonth}-01`;
        return leftKey.localeCompare(rightKey);
      })
      .forEach(({ summary }) => {
        if (pool <= 0) return;
        const target = Math.min(pool, summary.closingBalance);
        if (target > 0) {
          nextInputs[summary.statement.id] = target.toFixed(2);
          pool = roundMoney(pool - target);
        }
      });
    setAmountInputs(nextInputs);
    setError("");
  }

  function submit() {
    const rows = statementRows
      .map(({ summary }) => ({ statementId: summary.statement.id, periodMonth: summary.statement.periodMonth, amount: parseMoney(amountInputs[summary.statement.id] ?? "0"), outstanding: summary.closingBalance }))
      .filter((row) => row.amount > 0);
    if (rows.length === 0) {
      setError("请至少为一个账期填写核销金额。");
      return;
    }
    if (pendingTotal > settlement.unallocatedAmount + 0.001) {
      setError("核销金额合计不能超过剩余可核销金额。");
      return;
    }
    const overAllocated = rows.find((row) => row.amount > row.outstanding + 0.001);
    if (overAllocated) {
      setError(`账期 ${overAllocated.periodMonth} 的核销金额不能超过当前未收金额 ¥ ${formatMoney(overAllocated.outstanding)}。`);
      return;
    }
    const today = getTodayString();
    props.onSubmitAllocation(
      rows.map((row) => ({
        id: createId("ralloc"),
        receiptId: props.receipt.id,
        customerId: props.receipt.customerId,
        statementId: row.statementId,
        allocatedAmount: row.amount,
        allocationDate: today,
        note: "收款核销",
      })),
    );
  }

  return (
    <Modal onClose={props.onClose} size="receiptPool" title="收款核销">
      <>
        <div className="settlement-summary">
          <div>
            <span>本笔收款</span>
            <strong>¥ {formatMoney(props.receipt.amount)}</strong>
          </div>
          <div>
            <span>已核销</span>
            <strong>¥ {formatMoney(settlement.allocatedAmount)}</strong>
          </div>
          <div>
            <span>剩余可核销</span>
            <strong>¥ {formatMoney(settlement.unallocatedAmount)}</strong>
          </div>
          <div>
            <span>本次已填</span>
            <strong className={remaining < 0 ? "is-danger" : ""}>¥ {formatMoney(pendingTotal)}</strong>
          </div>
          <div>
            <span>客户</span>
            <strong>{props.customer?.name ?? "-"}</strong>
          </div>
          <div>
            <span>收款日期</span>
            <strong>{props.receipt.receiptDate}</strong>
          </div>
        </div>
      <div className="recon-table-wrap">
        <table className="recon-table recon-table-stable">
          <colgroup>
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "18%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>对账月份</th>
              <th>期初余额</th>
              <th>本月应收</th>
              <th>调整</th>
              <th>已核销</th>
              <th>当前未收</th>
              <th>到期日</th>
              <th>本次核销金额</th>
            </tr>
          </thead>
          <tbody>
            {openRows.length === 0 ? (
              <tr>
                <td colSpan={8}>该客户没有未结清的月度对账单，这笔收款将保留在未核销收款中。</td>
              </tr>
            ) : (
              openRows.map(({ summary, dueInfo }) => (
                <tr key={summary.statement.id}>
                  <td>{summary.statement.periodMonth}</td>
                  <td>¥ {formatMoney(summary.realtimeOpeningBalance)}</td>
                  <td>¥ {formatMoney(summary.currentReceivable)}</td>
                  <td className={summary.adjustmentNetAmount < 0 ? "is-danger" : ""}>
                    {summary.adjustmentNetAmount === 0 ? "¥ 0.00" : `${summary.adjustmentNetAmount > 0 ? "+" : "-"}¥ ${formatMoney(Math.abs(summary.adjustmentNetAmount))}`}
                  </td>
                  <td>¥ {formatMoney(summary.currentReceived)}</td>
                  <td className={summary.closingBalance > 0 ? "is-danger" : "is-ok"}>¥ {formatMoney(summary.closingBalance)}</td>
                  <td>{dueInfo.dueDate || "-"}</td>
                  <td>
                    <input
                      max={summary.closingBalance}
                      min="0"
                      onChange={(event) => setRowAmount(summary.statement.id, event.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      type="number"
                      value={amountInputs[summary.statement.id] ?? ""}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {error && <div className="receipt-pool__error">{error}</div>}
      <div className="recon-modal-actions">
        <button className="recon-button recon-button-light" disabled={openRows.length === 0} onClick={autoAllocate} type="button">
          自动核销（最早到期优先）
        </button>
        <button className="recon-button recon-button-light" onClick={props.onClose} type="button">
          取消
        </button>
        <button className="recon-button recon-button-primary" disabled={openRows.length === 0} onClick={submit} type="button">
          确认核销
        </button>
      </div>
      </>
    </Modal>
  );
}

function AllocationModal(props: {
  customerId: string;
  defaultReceiptId?: string;
  defaultStatementId?: string;
  onClose(): void;
  onSubmit(allocation: ReceiptAllocation | ReceiptAllocation[]): void;
  receiptAllocations: ReceiptAllocation[];
  receipts: CustomerReceipt[];
  statements: MonthlyStatement[];
  store: Parameters<typeof summarizeStatement>[1];
}) {
  const customerReceipts = props.receipts.filter((receipt) => receipt.customerId === props.customerId);
  const customerStatements = props.statements.filter((statement) => statement.customerId === props.customerId);
  const [receiptId, setReceiptId] = useState(props.defaultReceiptId ?? customerReceipts[0]?.id ?? "");
  const [statementId, setStatementId] = useState(props.defaultStatementId ?? customerStatements[0]?.id ?? "");
  const statementSummary = customerStatements.find((statement) => statement.id === statementId)
    ? summarizeStatement(customerStatements.find((statement) => statement.id === statementId)!, props.store)
    : null;
  const [styleAccountId, setStyleAccountId] = useState("");
  const selectedReceipt = customerReceipts.find((receipt) => receipt.id === receiptId);
  const remainingAmount = selectedReceipt
    ? roundMoney(selectedReceipt.amount - getReceiptAllocatedAmount(selectedReceipt.id, props.receiptAllocations))
    : 0;
  const selectedItemSummary = statementSummary?.items.find((item) => item.item.styleAccountId === styleAccountId);
  const statementUnpaidTotal = sumMoney((statementSummary?.items ?? []).map((item) => item.unpaidAmount));
  const maxAssignableAmount = styleAccountId
    ? roundMoney(Math.min(remainingAmount, selectedItemSummary?.unpaidAmount ?? 0))
    : roundMoney(Math.min(remainingAmount, statementUnpaidTotal));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  function buildAllocations() {
    if (!receiptId || !statementId) return [];
    let pendingAmount = roundMoney(Math.min(parseMoney(amount), remainingAmount));
    if (pendingAmount <= 0) return [];

    if (styleAccountId) {
      const itemUnpaidAmount = selectedItemSummary?.unpaidAmount ?? 0;
      const allocatedAmount = roundMoney(Math.min(pendingAmount, itemUnpaidAmount));
      return allocatedAmount > 0
        ? [
            {
              id: createId("alloc"),
              receiptId,
              customerId: props.customerId,
              statementId,
              styleAccountId,
              allocatedAmount,
              note: note.trim(),
            },
          ]
        : [];
    }

    const allocations: ReceiptAllocation[] = [];
    for (const item of statementSummary?.items ?? []) {
      if (pendingAmount <= 0) break;
      if (item.unpaidAmount <= 0) continue;
      const allocatedAmount = roundMoney(Math.min(pendingAmount, item.unpaidAmount));
      allocations.push({
        id: createId("alloc"),
        receiptId,
        customerId: props.customerId,
        statementId,
        styleAccountId: item.item.styleAccountId,
        allocatedAmount,
        note: note.trim() || "自动分配到整张月度对账单",
      });
      pendingAmount = roundMoney(pendingAmount - allocatedAmount);
    }
    return allocations;
  }

  return (
    <Modal onClose={props.onClose} title="收款分配">
      <form
        className="recon-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!receiptId || !statementId) return;
          const allocations = buildAllocations();
          if (allocations.length === 0) {
            window.alert("没有可分配金额，请检查收款未分配金额或款号未收金额。");
            return;
          }
          props.onSubmit(allocations);
        }}
      >
        <Field label="客户收款" required>
          <AnimatedSelect
            ariaLabel="客户收款"
            onChange={setReceiptId}
            options={customerReceipts.map((receipt) => {
              const allocated = getReceiptAllocatedAmount(receipt.id, props.receiptAllocations);
              return {
                label: `${receipt.receiptDate} / ¥ ${formatMoney(receipt.amount)} / 未分配 ¥ ${formatMoney(receipt.amount - allocated)}`,
                value: receipt.id,
              };
            })}
            value={receiptId}
          />
        </Field>
        <Field label="分配到月度对账单" required>
          <AnimatedSelect
            ariaLabel="分配到月度对账单"
            onChange={(value) => {
              setStatementId(value);
              setStyleAccountId("");
            }}
            options={customerStatements.map((statement) => ({ label: `${statement.periodMonth} / ${statement.status}`, value: statement.id }))}
            value={statementId}
          />
        </Field>
        <Field label="分配方式">
          <AnimatedSelect
            ariaLabel="分配方式"
            onChange={setStyleAccountId}
            options={[
              { label: "自动分配到整张月度对账单", value: "" },
              ...(statementSummary?.items.map((item) => ({
                label: `${item.styleAccount?.styleNo} / 未收 ¥ ${formatMoney(item.unpaidAmount)}`,
                value: item.item.styleAccountId,
              })) ?? []),
            ]}
            value={styleAccountId}
          />
        </Field>
        <Field label="分配金额">
          <>
            <div className="allocation-amount-row">
              <input
                min="0"
                onChange={(event) => setAmount(event.target.value)}
                placeholder={`最多可分配 ¥ ${formatMoney(maxAssignableAmount)}`}
                step="0.01"
                type="number"
                value={amount}
              />
              <button className="recon-button recon-button-light" onClick={() => setAmount(maxAssignableAmount.toFixed(2))} type="button">
                一键最大
              </button>
            </div>
            <small>
              收款未分配 ¥ {formatMoney(remainingAmount)} / 本月款号未收 ¥ {formatMoney(statementUnpaidTotal)}
            </small>
          </>
        </Field>
        <Field label="备注">
          <textarea onChange={(event) => setNote(event.target.value)} placeholder="例如：7月到账，归属6月尾款" value={note} />
        </Field>
        <ModalActions onClose={props.onClose} submitLabel="保存分配" />
      </form>
    </Modal>
  );
}

function StatementPreviewModal(props: {
  customerName: string;
  onClose(): void;
  statementSummary: NonNullable<ReturnType<typeof summarizeStatement>>;
}) {
  const statement = props.statementSummary.statement;
  const statementDate = formatDate(new Date());
  const openingBalance = props.statementSummary.openingBalance;
  const currentTotal = props.statementSummary.styleReceivableTotal;
  const adjustmentNetTotal = roundMoney(props.statementSummary.increaseAdjustmentTotal - props.statementSummary.decreaseAdjustmentTotal);
  const grandTotal = roundMoney(openingBalance + props.statementSummary.adjustedReceivable);
  const deductionTotal = roundMoney(-props.statementSummary.decreaseAdjustmentTotal);
  const getAdjustmentStyleNo = (styleAccountId?: string) =>
    props.statementSummary.items.find((item) => item.styleAccount?.id === styleAccountId || item.item.styleAccountId === styleAccountId)?.styleAccount?.styleNo ??
    "整月调整";

  return (
    <Modal onClose={props.onClose} size="wide" title="预览对账单">
      <div className="statement-preview">
        <div className="statement-print-area">
          <header className="statement-print-header">
            <h1>臻林纺织科技有限公司对账单</h1>
          </header>
          <div className="statement-print-meta">
            <span>对账客户：{props.customerName}</span>
            <span>对账月份：{statement.periodMonth}</span>
            <span>制表日期：{statementDate}</span>
          </div>
          <div className="statement-opening-balance">
            <div>
              <strong>期初余额：¥ {formatMoney(openingBalance)}</strong>
              <span>截至上月末，未结清的历史余额</span>
            </div>
          </div>
          <div className="statement-section-title">
            <span />
            <strong>本月对账明细</strong>
            <span />
          </div>
          <table className="statement-print-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>款号</th>
                <th>本月应收金额</th>
              </tr>
            </thead>
            <tbody>
              {props.statementSummary.items.map((item, index) => (
                <tr key={item.item.id}>
                  <td>{index + 1}</td>
                  <td>{item.styleAccount?.styleNo ?? "-"}</td>
                  <td className="statement-amount-cell">¥ {formatMoney(item.receivableAmount)}</td>
                </tr>
              ))}
              {props.statementSummary.items.length === 0 && (
                <tr>
                  <td colSpan={3}>暂无本月款号应收</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="statement-current-total">
                <td colSpan={2}>此月款号合计</td>
                <td className="statement-amount-cell">¥ {formatMoney(currentTotal)}</td>
              </tr>
            </tfoot>
          </table>
          {props.statementSummary.adjustments.length > 0 && (
            <>
              <div className="statement-section-title">
                <span />
                <strong>本月扣款 / 调整明细</strong>
                <span />
              </div>
              <table className="statement-print-table statement-adjustment-print-table">
                <thead>
                  <tr>
                    <th>编号</th>
                    <th>关联款号</th>
                    <th>说明</th>
                    <th>金额</th>
                  </tr>
                </thead>
                <tbody>
                  {props.statementSummary.adjustments.map((adjustment, index) => {
                    const signedAmount = getAdjustmentSignedAmount(adjustment);
                    return (
                      <tr key={adjustment.id}>
                        <td>{index + 1}</td>
                        <td>{getAdjustmentStyleNo(adjustment.relatedStyleAccountId)}</td>
                        <td>{adjustment.reason || adjustment.note || "-"}</td>
                        <td className="statement-amount-cell">
                          {signedAmount >= 0 ? "+" : "-"} ¥{formatMoney(Math.abs(signedAmount))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="statement-current-total">
                    <td colSpan={3}>调整合计</td>
                    <td className="statement-amount-cell">
                      {adjustmentNetTotal >= 0 ? "+" : "-"} ¥{formatMoney(Math.abs(adjustmentNetTotal))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}
          <table className="statement-print-table statement-final-total-table">
            <tbody>
              <tr>
                <td>期初余额</td>
                <td className="statement-amount-cell">¥ {formatMoney(openingBalance)}</td>
              </tr>
              <tr>
                <td>本月款号应收</td>
                <td className="statement-amount-cell">¥ {formatMoney(currentTotal)}</td>
              </tr>
              <tr>
                <td>本月扣款合计</td>
                <td className="statement-amount-cell">- ¥ {formatMoney(Math.abs(deductionTotal))}</td>
              </tr>
              <tr className="statement-grand-total">
                <td>总合计</td>
                <td className="statement-amount-cell">¥ {formatMoney(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
          <div className="statement-print-note">
            <strong>备注：</strong>
            <span>如有异议，请于收到对账单后 3 日内反馈。</span>
          </div>
          <div className="statement-confirm-row">
            <span>客户确认：__________</span>
            <span>日期：__________</span>
          </div>
        </div>
        <div className="statement-preview-actions">
          <button className="recon-button recon-button-light" onClick={props.onClose} type="button">
            关闭
          </button>
          <button className="recon-button recon-button-primary" onClick={() => window.print()} type="button">
            <Printer size={16} />
            打印
          </button>
        </div>
      </div>
    </Modal>
  );
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function Modal(props: { children: JSX.Element; onClose(): void; size?: "wide" | "receiptPool"; title: string }) {
  const sizeClass =
    props.size === "receiptPool"
      ? "recon-modal-receipt-pool"
      : props.size === "wide"
        ? "recon-modal-wide"
        : "";

  return (
    <div className="recon-modal-backdrop" role="presentation">
      <div aria-modal="true" className={`recon-modal ${sizeClass}`} role="dialog">
        <div className="recon-modal-head">
          <h2>{props.title}</h2>
          <button onClick={props.onClose} type="button">
            ×
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

function ConfirmationDialog(props: {
  confirmLabel: string;
  description: string;
  onCancel(): void;
  onConfirm(): void;
  title: string;
  tone: "danger" | "primary";
}) {
  return (
    <div className="recon-confirm-backdrop" role="presentation">
      <div aria-modal="true" className="recon-confirm-dialog" role="alertdialog">
        <div className={`recon-confirm-dialog__icon is-${props.tone}`}>
          {props.tone === "danger" ? <AlertTriangle size={22} /> : <LockOpen size={22} />}
        </div>
        <div className="recon-confirm-dialog__content">
          <h3>{props.title}</h3>
          <p>{props.description}</p>
        </div>
        <div className="recon-confirm-dialog__actions">
          <button className="recon-button recon-button-light" onClick={props.onCancel} type="button">
            取消
          </button>
          <button
            className={`recon-button ${props.tone === "danger" ? "recon-button-danger" : "recon-button-primary"}`}
            onClick={props.onConfirm}
            type="button"
          >
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalActions(props: { onClose(): void; submitLabel: string }) {
  return (
    <div className="recon-modal-actions">
      <button className="recon-button recon-button-light" onClick={props.onClose} type="button">
        取消
      </button>
      <button className="recon-button recon-button-primary" type="submit">
        {props.submitLabel}
      </button>
    </div>
  );
}

function Field(props: { children: JSX.Element; label: string; required?: boolean }) {
  return (
    <label className="recon-field">
      <span>
        {props.label}
        {props.required && <em>*</em>}
      </span>
      {props.children}
    </label>
  );
}

function RowActions(props: { onDelete(): void; onEdit(): void }) {
  return (
    <div className="recon-row-actions">
      <button onClick={props.onEdit} title="编辑" type="button">
        <Pencil size={15} />
      </button>
      <button onClick={props.onDelete} title="删除" type="button">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function StatCard(props: { icon: typeof Banknote; label: string; tone?: "warning"; value: number }) {
  const Icon = props.icon;
  return (
    <article className={`recon-stat-card ${props.tone === "warning" ? "is-warning" : ""}`}>
      <div>
        <span>{props.label}</span>
        <strong>¥ {formatMoney(props.value)}</strong>
      </div>
      <Icon size={22} />
    </article>
  );
}

function StatusPills(props: { labels: AccountStatus[] }) {
  return (
    <div className="recon-status-pills">
      {props.labels.map((label) => (
        <span className={`status-${label}`} key={label}>
          {label}
        </span>
      ))}
    </div>
  );
}

function EmptyPanel(props: { text: string }) {
  return <div className="recon-empty">{props.text}</div>;
}

function PlaceholderModule(props: { icon: typeof Settings; title: string }) {
  const Icon = props.icon;
  return (
    <section className="recon-placeholder">
      <Icon size={34} />
      <h2>{props.title}</h2>
      <p>当前版本先聚焦客户月度对账闭环，后续可以沿用同一数据结构扩展。</p>
    </section>
  );
}

function getModuleTitle(module: ActiveModule) {
  const item = navItems.find((navItem) => navItem.id === module);
  return item?.label ?? "客户对账";
}

function getTodayString() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function downloadWordDocument(filename: string, html: string) {
  const blob = new Blob([`\ufeff${html}`], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
