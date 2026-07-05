import { seedReconciliationStore } from "../data/seed";
import type {
  Customer,
  CustomerProfile,
  CustomerReceipt,
  MonthlyStatement,
  ReceiptAllocation,
  ReconciliationStore,
  StatementAdjustment,
  StatementItem,
  StyleAccount,
} from "../models";
import { sumMoney } from "../services/accounting";

const STORAGE_KEY = "zhenlin.customer-reconciliation.v2";
const LEGACY_STORAGE_KEY = "zhenlin.customer-reconciliation.v1";
const RESET_VERSION_STORAGE_KEY = "zhenlin.customer-reconciliation.reset-version";
const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const USE_EMPTY_INITIAL_DATA = env.VITE_EMPTY_INITIAL_RECONCILIATION === "true";
const DATA_RESET_VERSION = env.VITE_RECONCILIATION_DATA_RESET_VERSION ?? "";

export type ReconciliationRepository = {
  hasBusinessData(store: ReconciliationStore): boolean;
  load(): ReconciliationStore;
  loadCloud(token: string): Promise<ReconciliationStore>;
  mergeLocalToCloud(token: string, store: ReconciliationStore): Promise<ReconciliationStore>;
  save(store: ReconciliationStore): void;
  saveCloud(token: string, store: ReconciliationStore): Promise<void>;
  reset(): ReconciliationStore;
  usesEmptyInitialData(): boolean;
};

function cloneStore(store: ReconciliationStore): ReconciliationStore {
  return JSON.parse(JSON.stringify(store)) as ReconciliationStore;
}

function createEmptyStore(): ReconciliationStore {
  return {
    customers: [],
    customerProfiles: [],
    styleAccounts: [],
    monthlyStatements: [],
    statementItems: [],
    statementAdjustments: [],
    customerReceipts: [],
    receiptAllocations: [],
  };
}

function createInitialStore(): ReconciliationStore {
  return USE_EMPTY_INITIAL_DATA ? createEmptyStore() : cloneStore(seedReconciliationStore);
}

function shouldResetStoredDataForBuild(): boolean {
  return USE_EMPTY_INITIAL_DATA && DATA_RESET_VERSION !== "" && window.localStorage.getItem(RESET_VERSION_STORAGE_KEY) !== DATA_RESET_VERSION;
}

function markStoredDataResetForBuild() {
  if (USE_EMPTY_INITIAL_DATA && DATA_RESET_VERSION !== "") {
    window.localStorage.setItem(RESET_VERSION_STORAGE_KEY, DATA_RESET_VERSION);
  }
}

function hasBusinessData(store: ReconciliationStore) {
  return (
    store.customers.length > 0 ||
    store.customerProfiles.length > 0 ||
    store.styleAccounts.length > 0 ||
    store.monthlyStatements.length > 0 ||
    store.statementItems.length > 0 ||
    store.statementAdjustments.length > 0 ||
    store.customerReceipts.length > 0 ||
    store.receiptAllocations.length > 0
  );
}

function isFullStore(store: Partial<ReconciliationStore>): store is ReconciliationStore {
  return (
    Array.isArray(store.customers) &&
    (store.customerProfiles === undefined || Array.isArray(store.customerProfiles)) &&
    Array.isArray(store.styleAccounts) &&
    Array.isArray(store.monthlyStatements) &&
    Array.isArray(store.statementItems) &&
    (store.statementAdjustments === undefined || Array.isArray(store.statementAdjustments)) &&
    Array.isArray(store.customerReceipts) &&
    Array.isArray(store.receiptAllocations)
  );
}

function createProfileFromCustomer(customer: Customer, now: string): CustomerProfile {
  return {
    id: customer.id,
    shortName: customer.name,
    fullName: customer.name,
    customerType: "其他",
    status: "正常",
    contactName: customer.contact ?? "",
    mobile: "",
    phone: "",
    wechat: "",
    email: "",
    invoiceTitle: customer.name,
    taxNumber: "",
    invoiceAddress: "",
    invoicePhone: "",
    bankName: "",
    bankAccount: "",
    defaultPaymentTerm: "月结",
    statementDay: "每月25日",
    paymentDay: "次月10日",
    currency: "人民币",
    needInvoiceBeforePayment: false,
    shippingAddress: "",
    invoiceMailingAddress: "",
    note: customer.remark ?? "",
    createdAt: customer.createdAt ?? now,
    updatedAt: customer.updatedAt ?? now,
  };
}

function migrateLegacyStore(store: Partial<ReconciliationStore>): ReconciliationStore {
  const customers = store.customers ?? [];
  const styleAccounts = store.styleAccounts ?? [];
  const monthlyStatements: MonthlyStatement[] = [];
  const statementItems: StatementItem[] = [];
  const statementAdjustments: StatementAdjustment[] = [];
  const customerReceipts: CustomerReceipt[] = [];
  const receiptAllocations: ReceiptAllocation[] = [];
  const now = new Date().toISOString().slice(0, 10);

  customers.forEach((customer) => {
    const customerStyles = styleAccounts.filter((account) => account.customerId === customer.id);
    const statementId = `stmt-${customer.id}-2026-06`;
    const currentReceivable = sumMoney(
      customerStyles.flatMap((account) => account.receivableRecords.map((record) => record.amount)),
    );
    const currentInvoiced = sumMoney(
      customerStyles.flatMap((account) => account.invoiceRecords.map((record) => record.amount)),
    );
    const currentReceived = sumMoney(
      customerStyles.flatMap((account) => account.paymentRecords.map((record) => record.amount)),
    );

    monthlyStatements.push({
      id: statementId,
      customerId: customer.id,
      periodMonth: "2026-06",
      openingBalance: 0,
      currentReceivable,
      currentReceived,
      currentInvoiced,
      closingBalance: currentReceivable - currentReceived,
      status: currentReceivable - currentReceived <= 0 ? "已结清" : "草稿",
      note: "由旧版客户对账数据迁移",
      createdAt: now,
      updatedAt: now,
    });

    customerStyles.forEach((account) => {
      statementItems.push({
        id: `item-${account.id}`,
        statementId,
        customerId: customer.id,
        styleAccountId: account.id,
        receivableAmount: sumMoney(account.receivableRecords.map((record) => record.amount)),
        note: account.remark,
      });

      account.paymentRecords.forEach((payment) => {
        const receiptId = `receipt-${payment.id}`;
        customerReceipts.push({
          id: receiptId,
          customerId: customer.id,
          receiptDate: payment.date,
          amount: payment.amount,
          method: payment.method,
          transactionNo: "",
          periodMonth: "2026-06",
          note: payment.remark,
          createdAt: now,
          updatedAt: now,
        });
        receiptAllocations.push({
          id: `alloc-${payment.id}`,
          receiptId,
          customerId: customer.id,
          statementId,
          styleAccountId: account.id,
          allocatedAmount: payment.amount,
          note: "由旧版收款记录迁移",
        });
      });
    });
  });

  return {
    customers,
    customerProfiles: customers.map((customer) => createProfileFromCustomer(customer, now)),
    styleAccounts: styleAccounts as StyleAccount[],
    monthlyStatements,
    statementItems,
    statementAdjustments,
    customerReceipts,
    receiptAllocations,
  };
}

function normalizeStore(store: ReconciliationStore): ReconciliationStore {
  const now = new Date().toISOString().slice(0, 10);
  const existingProfiles = store.customerProfiles ?? [];
  const profileIds = new Set(existingProfiles.map((profile) => profile.id));
  const customerProfiles = [
    ...existingProfiles,
    ...store.customers.filter((customer) => !profileIds.has(customer.id)).map((customer) => createProfileFromCustomer(customer, now)),
  ];
  const profileById = new Map(customerProfiles.map((profile) => [profile.id, profile]));

  return {
    ...store,
    customerProfiles,
    statementAdjustments: store.statementAdjustments ?? [],
    customers: store.customers.map((customer) => {
      const profile = profileById.get(customer.id);
      return profile
        ? {
            ...customer,
            name: profile.shortName || profile.fullName,
            contact: profile.contactName,
            remark: profile.note,
            updatedAt: profile.updatedAt,
          }
        : customer;
    }),
    customerReceipts: store.customerReceipts.map((receipt) => ({
      ...receipt,
      periodMonth: receipt.periodMonth ?? receipt.receiptDate.slice(0, 7),
      createdAt: receipt.createdAt ?? now,
      updatedAt: receipt.updatedAt ?? now,
    })),
  };
}

export const reconciliationRepository: ReconciliationRepository = {
  hasBusinessData,
  load() {
    try {
      const rawStore = window.localStorage.getItem(STORAGE_KEY);
      if (rawStore) {
        const parsedStore = JSON.parse(rawStore) as Partial<ReconciliationStore>;
        if (isFullStore(parsedStore)) {
          const normalizedStore = normalizeStore(parsedStore);
          this.save(normalizedStore);
          return normalizedStore;
        }
      }

      const legacyStore = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyStore) {
        const migratedStore = migrateLegacyStore(JSON.parse(legacyStore) as Partial<ReconciliationStore>);
        this.save(migratedStore);
        return migratedStore;
      }

      if (shouldResetStoredDataForBuild()) {
        const initialStore = createInitialStore();
        this.save(initialStore);
        markStoredDataResetForBuild();
        return initialStore;
      }

      const initialStore = createInitialStore();
      this.save(initialStore);
      return initialStore;
    } catch {
      const initialStore = createInitialStore();
      this.save(initialStore);
      return initialStore;
    }
  },
  save(store) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  },
  async loadCloud(token) {
    const response = await fetch("/api/reconciliation/store", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw await createApiError(response);
    const body = (await response.json()) as { store: ReconciliationStore };
    const normalizedStore = normalizeStore(body.store);
    this.save(normalizedStore);
    return normalizedStore;
  },
  async saveCloud(token, store) {
    const response = await fetch("/api/reconciliation/store", {
      body: JSON.stringify({ store }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "PUT",
    });
    if (!response.ok) throw await createApiError(response);
  },
  async mergeLocalToCloud(token, store) {
    const response = await fetch("/api/reconciliation/import", {
      body: JSON.stringify({ store }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    if (!response.ok) throw await createApiError(response);
    const body = (await response.json()) as { store: ReconciliationStore };
    const normalizedStore = normalizeStore(body.store);
    this.save(normalizedStore);
    return normalizedStore;
  },
  reset() {
    const initialStore = createInitialStore();
    this.save(initialStore);
    markStoredDataResetForBuild();
    return initialStore;
  },
  usesEmptyInitialData() {
    return USE_EMPTY_INITIAL_DATA;
  },
};

async function createApiError(response: Response) {
  try {
    const body = await response.json();
    const error = new Error(body?.error?.message || "云端数据请求失败");
    error.name = body?.error?.code || "API_ERROR";
    return error;
  } catch {
    return new Error("云端数据请求失败");
  }
}
