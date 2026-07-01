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

export type ReconciliationRepository = {
  load(): ReconciliationStore;
  save(store: ReconciliationStore): void;
  reset(): ReconciliationStore;
};

function cloneStore(store: ReconciliationStore): ReconciliationStore {
  return JSON.parse(JSON.stringify(store)) as ReconciliationStore;
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

      const initialStore = cloneStore(seedReconciliationStore);
      this.save(initialStore);
      return initialStore;
    } catch {
      const initialStore = cloneStore(seedReconciliationStore);
      this.save(initialStore);
      return initialStore;
    }
  },
  save(store) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  },
  reset() {
    const initialStore = cloneStore(seedReconciliationStore);
    this.save(initialStore);
    return initialStore;
  },
};
