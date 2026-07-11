import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  Banknote,
  BarChart3,
  CreditCard,
  Eye,
  FileCog,
  FileDown,
  FileText,
  Landmark,
  LayoutDashboard,
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
import { ClickSpark } from "../components/common/ClickSpark";
import { Particles } from "../components/common/Particles";
import type {
  AccountStatus,
  AdjustmentDirection,
  Customer,
  CustomerProfile,
  CustomerProfileStatus,
  CustomerType,
  CustomerReceipt,
  InvoiceRecord,
  MonthlyStatement,
  PaymentMethod,
  ReceiptAllocation,
  StatementAdjustment,
  StatementItem,
  StatementStatus,
  StyleAccount,
} from "./models";
import {
  accountStatusOptions,
  adjustmentDirectionOptions,
  customerProfileStatusOptions,
  customerTypeOptions,
  paymentMethods,
  statementStatusOptions,
} from "./models";
import { reconciliationRepository } from "./repositories/reconciliationRepository";
import {
  readCustomerProfileImportFile,
  type CustomerProfileImportRow,
} from "./utils/customerProfileImport";
import { readReceiptImportFile, type ReceiptImportRow } from "./utils/receiptImport";
import {
  accountMatchesStatus,
  formatMoney,
  getAvailablePeriods,
  getCurrentPeriod,
  getCustomerDisplayName,
  getCustomerProfile,
  getDefaultOpeningBalance,
  getAdjustmentSignedAmount,
  getReceiptAllocatedAmount,
  parseMoney,
  roundMoney,
  sumMoney,
  summarizeAll,
  summarizeCustomer,
  summarizeStatement,
} from "./services/accounting";
import "./styles.css";

type ActiveModule = "customer" | "customerProfiles" | "supplier" | "overview" | "payments" | "invoices" | "settings";
type DetailTab = "receivable" | "adjustment" | "invoice" | "payment";

type ModalState =
  | { type: "customer"; customer?: Customer }
  | { type: "statement"; customerId?: string }
  | { type: "statementItem"; item?: StatementItem; customerId: string; statementId: string }
  | { type: "invoice"; accountId: string; statementPeriod: string; record?: InvoiceRecord }
  | { type: "receiptPool"; customerId: string }
  | { type: "allocation"; customerId: string; statementId?: string }
  | { type: "statementPreview" }
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
  { id: "payments", label: "收款记录", icon: CreditCard },
  { id: "invoices", label: "开票记录", icon: ReceiptText },
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

export function ReconciliationApp() {
  const auth = useAuth();
  const [store, setStore] = useState(() => reconciliationRepository.load());
  const periods = useMemo(() => getAvailablePeriods(store), [store]);
  const [activeModule, setActiveModule] = useState<ActiveModule>("customer");
  const [selectedCustomerId, setSelectedCustomerId] = useState(store.customers[0]?.id ?? "");
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0] ?? getCurrentPeriod());
  const [selectedItemId, setSelectedItemId] = useState("");
  const [detailTab, setDetailTab] = useState<DetailTab>("receivable");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [draftFilters, setDraftFilters] = useState<Filters>(emptyFilters);
  const [modal, setModal] = useState<ModalState>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("loading");
  const [cloudNotice, setCloudNotice] = useState("正在同步云端数据...");
  const [showCloudNotice, setShowCloudNotice] = useState(true);
  const cloudReadyRef = useRef(false);
  const latestSaveIdRef = useRef(0);
  const isLocalDevelopment = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const currentUserLabel = isLocalDevelopment ? "本地开发" : auth.user?.displayName || auth.user?.username;

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
    setStore((currentStore) => updater(currentStore));
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
    const normalizedProfile = { ...profile, updatedAt: today };
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
      return {
        ...currentStore,
        customerProfiles: exists
          ? currentStore.customerProfiles.map((item) => (item.id === normalizedProfile.id ? normalizedProfile : item))
          : [normalizedProfile, ...currentStore.customerProfiles],
        customers: customerExists
          ? currentStore.customers.map((item) => (item.id === customer.id ? { ...item, ...customer } : item))
          : [customer, ...currentStore.customers],
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

  function createStatement(values: {
    customerId: string;
    periodMonth: string;
    openingBalance: number;
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
      note: values.note,
      createdAt: today,
      updatedAt: today,
    };
    updateStore((currentStore) => ({ ...currentStore, monthlyStatements: [statement, ...currentStore.monthlyStatements] }));
    setSelectedCustomerId(statement.customerId);
    setSelectedPeriod(statement.periodMonth);
  }

  function updateStatementStatus(statementId: string, status: StatementStatus) {
    const today = getTodayString();
    updateStore((currentStore) => ({
      ...currentStore,
      monthlyStatements: currentStore.monthlyStatements.map((statement) =>
        statement.id === statementId ? { ...statement, status, updatedAt: today } : statement,
      ),
    }));
  }

  function upsertStatementItem(values: {
    statementId: string;
    customerId: string;
    styleNo: string;
    receivableAmount: number;
    note: string;
  }, itemId?: string) {
    const today = getTodayString();
    if (itemId) {
      updateStore((currentStore) => ({
        ...currentStore,
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
      }));
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
    if (!window.confirm("确认删除这条月度对账明细吗？")) return;
    updateStore((currentStore) => ({
      ...currentStore,
      statementItems: currentStore.statementItems.filter((item) => item.id !== itemId),
    }));
  }

  function upsertStatementAdjustment(adjustment: StatementAdjustment) {
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
    if (!window.confirm("确认删除这条扣款/调整记录吗？")) return;
    updateStore((currentStore) => ({
      ...currentStore,
      statementAdjustments: (currentStore.statementAdjustments ?? []).filter((item) => item.id !== adjustmentId),
    }));
  }

  function upsertInvoice(accountId: string, record: InvoiceRecord) {
    updateStore((currentStore) => ({
      ...currentStore,
      styleAccounts: currentStore.styleAccounts.map((account) =>
        account.id === accountId
          ? {
              ...account,
              invoiceRecords: account.invoiceRecords.some((item) => item.id === record.id)
                ? account.invoiceRecords.map((item) => (item.id === record.id ? record : item))
                : [record, ...account.invoiceRecords],
              updatedAt: getTodayString(),
            }
          : account,
      ),
    }));
  }

  function deleteInvoice(accountId: string, invoiceId: string) {
    if (!window.confirm("确认删除这条开票记录吗？")) return;
    updateStore((currentStore) => ({
      ...currentStore,
      styleAccounts: currentStore.styleAccounts.map((account) =>
        account.id === accountId
          ? { ...account, invoiceRecords: account.invoiceRecords.filter((record) => record.id !== invoiceId) }
          : account,
      ),
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
          return [customer.name, profile?.shortName, profile?.fullName].some((name) => normalize(name) === keyword);
        });
        return matched.length === 1 ? matched[0].id : "";
      }

      function isDuplicate(receipt: CustomerReceipt) {
        return nextReceipts.some(
          (item) =>
            item.customerId === receipt.customerId &&
            item.receiptDate === receipt.receiptDate &&
            item.amount === receipt.amount &&
            item.method === receipt.method &&
            normalize(item.transactionNo) === normalize(receipt.transactionNo),
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
          transactionNo: row.transactionNo,
          periodMonth: row.receiptDate.slice(0, 7),
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

  function createAllocation(values: ReceiptAllocation | ReceiptAllocation[]) {
    const nextAllocations = Array.isArray(values) ? values : [values];
    if (nextAllocations.length === 0) return;
    updateStore((currentStore) => ({
      ...currentStore,
      receiptAllocations: [...nextAllocations, ...currentStore.receiptAllocations],
    }));
  }

  function deleteAllocation(allocationId: string) {
    if (!window.confirm("确认删除这条收款分配吗？")) return;
    updateStore((currentStore) => ({
      ...currentStore,
      receiptAllocations: currentStore.receiptAllocations.filter((allocation) => allocation.id !== allocationId),
    }));
  }

  function exportCurrentStatementWord() {
    if (!selectedCustomer || !selectedStatementSummary) return;
    const statement = selectedStatementSummary.statement;
    const statementDate = formatDate(new Date());
    const openingBalance = selectedStatementSummary.realtimeOpeningBalance;
    const currentTotal = selectedStatementSummary.styleReceivableTotal;
    const adjustmentNetTotal = roundMoney(selectedStatementSummary.increaseAdjustmentTotal - selectedStatementSummary.decreaseAdjustmentTotal);
    const deductionTotal = roundMoney(-selectedStatementSummary.decreaseAdjustmentTotal);
    const grandTotal = selectedStatementSummary.grandTotal;
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
      <div className="recon-shell">
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
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="recon-sidebar-foot">
          <span>本地 MVP</span>
        </div>
      </aside>

      <main className="recon-main">
        <header className="recon-topbar">
          <div>
            <span className="recon-kicker">财务 / 月度客户对账</span>
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
            onAddAllocation={() => selectedCustomerId && setModal({ type: "allocation", customerId: selectedCustomerId, statementId: selectedStatement?.id })}
            onAddInvoice={(accountId) =>
              setModal({ type: "invoice", accountId, statementPeriod: selectedStatement?.periodMonth ?? selectedPeriod })
            }
            onAddItem={() =>
              selectedStatement &&
              setModal({ type: "statementItem", customerId: selectedStatement.customerId, statementId: selectedStatement.id })
            }
            onAddStatement={() => setModal({ type: "statement", customerId: selectedCustomerId })}
            onOpenReceiptPool={() => selectedCustomerId && setModal({ type: "receiptPool", customerId: selectedCustomerId })}
            onApplyFilters={() => setFilters(draftFilters)}
            onDeleteAllocation={deleteAllocation}
            onDeleteAdjustment={deleteStatementAdjustment}
            onDeleteInvoice={deleteInvoice}
            onDeleteItem={deleteStatementItem}
            onEditInvoice={(accountId, record) =>
              setModal({ type: "invoice", accountId, statementPeriod: selectedStatement?.periodMonth ?? selectedPeriod, record })
            }
            onEditItem={(item) =>
              selectedStatement && setModal({ type: "statementItem", item, customerId: selectedStatement.customerId, statementId: selectedStatement.id })
            }
            onExport={exportCurrentStatementWord}
            onPreview={() => selectedStatementSummary && setModal({ type: "statementPreview" })}
            onSaveAdjustment={upsertStatementAdjustment}
            onStatementStatusChange={(status) => selectedStatement && updateStatementStatus(selectedStatement.id, status)}
            onFiltersChange={setDraftFilters}
            onPeriodChange={setSelectedPeriod}
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
        {activeModule === "payments" && (
          <ReceiptPoolModule
            allocations={store.receiptAllocations}
            customers={store.customers}
            onAllocate={(customerId) => setModal({ type: "allocation", customerId })}
            onImport={importReceipts}
            receipts={store.customerReceipts}
          />
        )}
        {activeModule === "invoices" && <InvoiceRecordsModule customers={store.customers} styleAccounts={store.styleAccounts} />}
        {activeModule === "settings" && <SettingsModule />}
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
      {modal?.type === "invoice" && (
        <InvoiceModal
          periodMonth={modal.statementPeriod}
          record={modal.record}
          onClose={() => setModal(null)}
          onSubmit={(record) => {
            upsertInvoice(modal.accountId, record);
            setModal(null);
          }}
        />
      )}
      {modal?.type === "receiptPool" && (
        <ReceiptPoolModal
          allocations={store.receiptAllocations}
          customer={store.customers.find((item) => item.id === modal.customerId)}
          periods={Array.from(
            new Set(
              store.monthlyStatements
                .filter((statement) => statement.customerId === modal.customerId)
                .map((statement) => statement.periodMonth),
            ),
          )}
          receipts={store.customerReceipts.filter((receipt) => receipt.customerId === modal.customerId)}
          onClose={() => setModal(null)}
          onSave={(receipts, deletedReceiptIds) => {
            saveReceiptPool(modal.customerId, receipts, deletedReceiptIds);
            setModal(null);
          }}
        />
      )}
      {modal?.type === "allocation" && (
        <AllocationModal
          customerId={modal.customerId}
          defaultStatementId={modal.statementId}
          receipts={store.customerReceipts}
          receiptAllocations={store.receiptAllocations}
          statements={store.monthlyStatements}
          store={store}
          onClose={() => setModal(null)}
          onSubmit={(allocation) => {
            createAllocation(allocation);
            setModal(null);
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
      </div>
    </ClickSpark>
  );
}

function CustomerStatementPanel(props: {
  customerSummaries: ReturnType<typeof summarizeCustomer>[];
  detailTab: DetailTab;
  draftFilters: Filters;
  filteredItems: NonNullable<ReturnType<typeof summarizeStatement>["items"]>;
  onAddAllocation(): void;
  onAddInvoice(accountId: string): void;
  onAddItem(): void;
  onAddStatement(): void;
  onOpenReceiptPool(): void;
  onApplyFilters(): void;
  onDeleteAllocation(allocationId: string): void;
  onDeleteAdjustment(adjustmentId: string): void;
  onDeleteInvoice(accountId: string, invoiceId: string): void;
  onDeleteItem(itemId: string): void;
  onEditInvoice(accountId: string, record: InvoiceRecord): void;
  onEditItem(item: StatementItem): void;
  onExport(): void;
  onPreview(): void;
  onSaveAdjustment(adjustment: StatementAdjustment): void;
  onStatementStatusChange(status: StatementStatus): void;
  onFiltersChange(filters: Filters): void;
  onPeriodChange(period: string): void;
  onResetFilters(): void;
  onSelectCustomer(customerId: string): void;
  onSelectItem(itemId: string): void;
  onSetDetailTab(tab: DetailTab): void;
  periods: string[];
  receiptAllocations: ReceiptAllocation[];
  receipts: CustomerReceipt[];
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
  const openingBalanceDifference = props.selectedStatementSummary?.openingBalanceDifference ?? 0;
  const hasOpeningBalanceDifference = Math.abs(openingBalanceDifference) >= 0.01;
  const [customerSearchText, setCustomerSearchText] = useState("");
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

  return (
    <div className="recon-workspace">
      <section className="recon-filterbar recon-filterbar-monthly" aria-label="筛选区">
        <label>
          客户名称
          <input
            onChange={(event) => props.onFiltersChange({ ...props.draftFilters, customerName: event.target.value })}
            placeholder="输入客户名称"
            value={props.draftFilters.customerName}
          />
        </label>
        <label>
          对账月份
          <AnimatedSelect
            ariaLabel="对账月份"
            onChange={props.onPeriodChange}
            options={toSelectOptions(props.periods)}
            value={props.selectedPeriod}
          />
        </label>
        <label>
          款号
          <input
            onChange={(event) => props.onFiltersChange({ ...props.draftFilters, styleNo: event.target.value })}
            placeholder="输入款号"
            value={props.draftFilters.styleNo}
          />
        </label>
        <label>
          对账状态
          <AnimatedSelect
            ariaLabel="对账状态"
            onChange={(value) => props.onFiltersChange({ ...props.draftFilters, status: value as AccountStatus | "" })}
            options={[{ label: "全部状态", value: "" }, ...toSelectOptions(accountStatusOptions)]}
            value={props.draftFilters.status}
          />
        </label>
        <button className="recon-button recon-button-primary" onClick={props.onApplyFilters} type="button">
          <Search size={16} />
          查询
        </button>
        <button className="recon-button recon-button-light" onClick={props.onResetFilters} type="button">
          <RotateCcw size={16} />
          重置
        </button>
        <button className="recon-button recon-button-primary recon-add-statement-filter" onClick={props.onAddStatement} type="button">
          <Plus size={16} />
          新增月度对账单
        </button>
      </section>

      <section className="recon-stat-grid recon-stat-grid-seven" aria-label="月度统计卡片">
        <StatCard label="账单期初余额" value={props.selectedStatementSummary?.openingBalance ?? 0} icon={Banknote} />
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
                <span>{summary.statementCount} 张月度对账单 / {summary.styleCount} 个款号</span>
                <em>总未收 ¥ {formatMoney(summary.closingBalanceTotal)}</em>
              </button>
            ))}
          </div>
        </aside>

        <div className="recon-account-panel">
          <div className="recon-customer-summary recon-statement-summary">
            <div>
              <span>当前客户 / 对账月份</span>
              <h2>{props.selectedCustomerName} / {props.selectedPeriod}</h2>
              {props.statement && (
                <div className="statement-status-control">
                  <label>
                    <span>账单状态</span>
                    <AnimatedSelect
                      ariaLabel="账单状态"
                      onChange={(value) => props.onStatementStatusChange(value as StatementStatus)}
                      options={toSelectOptions(["草稿", "已确认"])}
                      value={props.statement.status === "已结清" ? "已确认" : props.statement.status}
                    />
                  </label>
                  {props.selectedStatementSummary?.status === "已结清" && <em>系统判断：已结清</em>}
                  {props.statement.note && <small>{props.statement.note}</small>}
                  {hasOpeningBalanceDifference && (
                    <small className="realtime-opening-note">
                      上月余额已变化，实时期初余额 ¥ {formatMoney(props.selectedStatementSummary?.realtimeOpeningBalance ?? 0)}
                    </small>
                  )}
                </div>
              )}
            </div>
            <div className="recon-topbar-actions recon-statement-actions">
              <button className="recon-button recon-button-light" onClick={props.onOpenReceiptPool} type="button">
                <CreditCard size={16} />
                收款池
              </button>
              <button className="recon-button recon-button-light" disabled={!props.statement} onClick={props.onAddAllocation} type="button">
                <ReceiptText size={16} />
                收款分配
              </button>
              <button className="recon-button recon-button-light" disabled={!props.statement} onClick={props.onExport} type="button">
                <FileDown size={16} />
                导出 Word
              </button>
              <button className="recon-button recon-button-light" disabled={!props.statement} onClick={props.onPreview} type="button">
                <Eye size={16} />
                预览对账单
              </button>
              <button className="recon-button recon-button-primary recon-statement-add-item" disabled={!props.statement} onClick={props.onAddItem} type="button">
                <Plus size={16} />
                新增款号应收
              </button>
            </div>
          </div>

          {!props.statement ? (
            <EmptyPanel text="当前客户在该月份还没有月度对账单，请先新增月度对账单。" />
          ) : (
            <>
              <div className="recon-table-wrap">
                <table className="recon-table">
                  <thead>
                    <tr>
                      <th>款号</th>
                      <th>应收金额</th>
                      <th>已开票金额</th>
                      <th>已收款金额</th>
                      <th>调整</th>
                      <th>未收金额</th>
                      <th>对账状态</th>
                      <th>操作</th>
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
                              <FileText size={15} />
                            </button>
                            <button onClick={() => props.onEditItem(itemSummary.item)} title="编辑" type="button">
                              <Pencil size={15} />
                            </button>
                            <button onClick={() => props.onDeleteItem(itemSummary.item.id)} title="删除" type="button">
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

              <StatementDetail
                account={props.selectedAccount}
                adjustments={props.selectedStatementSummary!.adjustments}
                allocations={props.receiptAllocations}
                detailTab={props.detailTab}
                itemSummary={props.selectedItemSummary}
                onAddInvoice={props.onAddInvoice}
                onDeleteAdjustment={props.onDeleteAdjustment}
                onDeleteAllocation={props.onDeleteAllocation}
                onDeleteInvoice={props.onDeleteInvoice}
                onEditInvoice={props.onEditInvoice}
                onSaveAdjustment={props.onSaveAdjustment}
                onSetDetailTab={props.onSetDetailTab}
                receipts={props.receipts}
                statement={props.statement}
                statementId={props.statement.id}
                statementItems={props.selectedStatementSummary!.items}
              />
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function StatementDetail(props: {
  account?: StyleAccount;
  adjustments: StatementAdjustment[];
  allocations: ReceiptAllocation[];
  detailTab: DetailTab;
  itemSummary?: ReturnType<typeof summarizeStatement>["items"][number];
  onAddInvoice(accountId: string): void;
  onDeleteAdjustment(adjustmentId: string): void;
  onDeleteAllocation(allocationId: string): void;
  onDeleteInvoice(accountId: string, invoiceId: string): void;
  onEditInvoice(accountId: string, record: InvoiceRecord): void;
  onSaveAdjustment(adjustment: StatementAdjustment): void;
  onSetDetailTab(tab: DetailTab): void;
  receipts: CustomerReceipt[];
  statement: MonthlyStatement;
  statementId: string;
  statementItems: ReturnType<typeof summarizeStatement>["items"];
}) {
  const statementAllocations = props.allocations.filter((allocation) => allocation.statementId === props.statementId);
  const styleAllocations = statementAllocations.filter((allocation) => allocation.styleAccountId === props.account?.id);
  const statementOnlyAllocations = statementAllocations.filter((allocation) => !allocation.styleAccountId);
  const visibleAdjustments = props.adjustments;

  function addAdjustment() {
    const today = getTodayString();
    props.onSaveAdjustment({
      id: createId("adj"),
      customerId: props.statement.customerId,
      statementId: props.statement.id,
      periodMonth: props.statement.periodMonth,
      adjustmentDate: today,
      adjustmentType: "质量扣款",
      direction: "decrease",
      amount: 0,
      relatedStyleAccountId: "",
      reason: "",
      note: "",
      createdAt: today,
      updatedAt: today,
    });
  }

  return (
    <section className="recon-detail">
      <div className="recon-detail-head">
        <div>
          <span>{props.account ? "款号明细" : "月度对账单"}</span>
          <h3>{props.account?.styleNo ?? "扣款调整"}</h3>
        </div>
        {props.itemSummary && (
          <div className="recon-detail-total">
            <span>应收 ¥ {formatMoney(props.itemSummary.receivableAmount)}</span>
            <span>款号未收 ¥ {formatMoney(props.itemSummary.unpaidAmount)}</span>
          </div>
        )}
      </div>

      <div className="recon-detail-toolbar">
        <div className="recon-tabs" role="tablist">
          {[
            ["receivable", "款号明细"],
            ["adjustment", "扣款调整"],
            ["invoice", "开票记录"],
            ["payment", "收款分配"],
          ].map(([id, label]) => (
            <button className={props.detailTab === id ? "is-active" : ""} key={id} onClick={() => props.onSetDetailTab(id as DetailTab)} type="button">
              {label}
            </button>
          ))}
        </div>
        <div className="recon-detail-toolbar-actions">
          {props.detailTab === "adjustment" && (
            <button className="recon-button recon-button-warning" onClick={addAdjustment} type="button">
              <Plus size={16} />
              新增扣款
            </button>
          )}
          {props.detailTab === "invoice" && (
            <button
              className="recon-button recon-button-accent"
              disabled={!props.account}
              onClick={() => props.account && props.onAddInvoice(props.account.id)}
              type="button"
            >
              <Plus size={16} />
              新增开票
            </button>
          )}
        </div>
      </div>

      {props.detailTab === "receivable" && props.itemSummary && props.account && (
        <RecordTable
          addLabel=""
          columns={["归属月度单", "款号", "应收金额", "备注"]}
          rows={[
            [
              props.itemSummary!.item.statementId,
              props.account!.styleNo,
              `¥ ${formatMoney(props.itemSummary!.receivableAmount)}`,
              props.itemSummary!.item.note || "-",
            ],
          ]}
        />
      )}
      {props.detailTab === "receivable" && (!props.itemSummary || !props.account) && <EmptyPanel text="请选择一个款号查看明细记录。" />}
      {props.detailTab === "adjustment" && (
        <StatementAdjustmentTable
          adjustments={visibleAdjustments}
          onDelete={props.onDeleteAdjustment}
          onSave={props.onSaveAdjustment}
          statement={props.statement}
          statementItems={props.statementItems}
        />
      )}
      {props.detailTab === "invoice" && props.account && (
        <RecordTable
          columns={["日期", "发票号码", "开票金额", "备注", "操作"]}
          rows={props.account!.invoiceRecords.map((record) => [
            record.date,
            record.invoiceNo,
            `¥ ${formatMoney(record.amount)}`,
            record.remark || "-",
            <RowActions
              key={record.id}
              onDelete={() => props.onDeleteInvoice(props.account!.id, record.id)}
              onEdit={() => props.onEditInvoice(props.account!.id, record)}
            />,
          ])}
        />
      )}
      {props.detailTab === "invoice" && !props.account && <EmptyPanel text="请选择一个款号录入开票记录。" />}
      {props.detailTab === "payment" && (
        <RecordTable
          addLabel=""
          columns={["收款日期", "分配范围", "分配金额", "流水号", "备注", "操作"]}
          rows={[
            ...styleAllocations.map((allocation) => {
              const receipt = props.receipts.find((item) => item.id === allocation.receiptId);
              return [
                receipt?.receiptDate ?? "-",
                props.account?.styleNo ?? "-",
                `¥ ${formatMoney(allocation.allocatedAmount)}`,
                receipt?.transactionNo || "-",
                allocation.note || "-",
                <RowActions key={allocation.id} onDelete={() => props.onDeleteAllocation(allocation.id)} onEdit={() => undefined} />,
              ];
            }),
            ...statementOnlyAllocations.map((allocation) => {
              const receipt = props.receipts.find((item) => item.id === allocation.receiptId);
              return [
                receipt?.receiptDate ?? "-",
                "整张月度对账单",
                `¥ ${formatMoney(allocation.allocatedAmount)}`,
                receipt?.transactionNo || "-",
                allocation.note || "-",
                <RowActions key={allocation.id} onDelete={() => props.onDeleteAllocation(allocation.id)} onEdit={() => undefined} />,
              ];
            }),
          ]}
        />
      )}
    </section>
  );
}

function StatementAdjustmentTable(props: {
  adjustments: StatementAdjustment[];
  onDelete(adjustmentId: string): void;
  onSave(adjustment: StatementAdjustment): void;
  statement: MonthlyStatement;
  statementItems: ReturnType<typeof summarizeStatement>["items"];
}) {
  const styleOptions = props.statementItems
    .map((item) => ({ id: item.styleAccount?.id ?? item.item.styleAccountId, styleNo: item.styleAccount?.styleNo ?? "-" }))
    .filter((item) => item.id);

  function updateAdjustment(adjustment: StatementAdjustment, patch: Partial<StatementAdjustment>) {
    props.onSave({
      ...adjustment,
      ...patch,
      amount: patch.amount === undefined ? adjustment.amount : roundMoney(patch.amount),
      updatedAt: getTodayString(),
    });
  }

  return (
    <div className="recon-record-card">
      <table className="recon-table recon-table-compact adjustment-table">
        <thead>
          <tr>
            <th>调整方向</th>
            <th>关联款号</th>
            <th>金额</th>
            <th>说明</th>
            <th>备注</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {props.adjustments.map((adjustment) => (
            <tr key={adjustment.id}>
              <td>
                <AnimatedSelect
                  ariaLabel="调整方向"
                  onChange={(value) => updateAdjustment(adjustment, { direction: value as AdjustmentDirection })}
                  options={adjustmentDirectionOptions.map((item) => ({ label: item.label, value: item.value }))}
                  value={adjustment.direction}
                />
              </td>
              <td>
                <AnimatedSelect
                  ariaLabel="关联款号"
                  onChange={(value) => updateAdjustment(adjustment, { relatedStyleAccountId: value })}
                  options={[{ label: "整月调整", value: "" }, ...styleOptions.map((style) => ({ label: style.styleNo, value: style.id }))]}
                  value={adjustment.relatedStyleAccountId ?? ""}
                />
              </td>
              <td>
                <input
                  min="0"
                  onChange={(event) => updateAdjustment(adjustment, { amount: parseMoney(event.target.value) })}
                  step="0.01"
                  type="number"
                  value={adjustment.amount}
                />
              </td>
              <td>
                <input onChange={(event) => updateAdjustment(adjustment, { reason: event.target.value })} value={adjustment.reason} />
              </td>
              <td>
                <input onChange={(event) => updateAdjustment(adjustment, { note: event.target.value })} value={adjustment.note ?? ""} />
              </td>
              <td>
                <button className="recon-icon-button" onClick={() => props.onDelete(adjustment.id)} title="删除" type="button">
                  <Trash2 size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {props.adjustments.length === 0 && <EmptyPanel text="本月暂无扣款或调整项。" />}
    </div>
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
    props.profiles.find((profile) => profile.id === props.selectedCustomerId) ?? createBlankCustomerProfile(),
  );
  const [isNew, setIsNew] = useState(props.profiles.length === 0);

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
    setEditingProfile(profile);
    setIsNew(false);
    props.onSelect(profile.id);
  }

  function startNewProfile() {
    setEditingProfile(createBlankCustomerProfile());
    setIsNew(true);
  }

  function updateProfile(patch: Partial<CustomerProfile>) {
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
    props.onSave({
      ...editingProfile,
      shortName: editingProfile.shortName.trim(),
      fullName: editingProfile.fullName.trim(),
      contactName: editingProfile.contactName.trim(),
    });
    setIsNew(false);
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
            {visibleProfiles.map((profile) => {
              const summary = summarizeCustomer({ id: profile.id, name: profile.shortName, createdAt: profile.createdAt, updatedAt: profile.updatedAt }, props.store);
              return (
                <button
                  className={!isNew && editingProfile.id === profile.id ? "is-selected" : ""}
                  key={profile.id}
                  onClick={() => selectProfile(profile)}
                  type="button"
                >
                  <strong>{profile.shortName}</strong>
                  <span>{profile.fullName}</span>
                  <span>{profile.contactName || "未填写联系人"} · {profile.status}</span>
                  <em>未收 ¥ {formatMoney(summary.closingBalanceTotal)}</em>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="customer-profile-detail">
          <div className="customer-profile-detail__head">
            <div>
              <span>{isNew ? "新增客户资料" : "编辑客户资料"}</span>
              <h2>{editingProfile.shortName || "未命名客户"}</h2>
            </div>
          <div className="recon-topbar-actions">
              <button className="recon-button recon-button-primary" onClick={saveProfile} type="button">
                保存
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

            <ProfileSection title="地址信息">
              <ProfileTextarea label="收货地址" onChange={(value) => updateProfile({ shippingAddress: value })} value={editingProfile.shippingAddress} />
              <ProfileTextarea label="寄票地址" onChange={(value) => updateProfile({ invoiceMailingAddress: value })} value={editingProfile.invoiceMailingAddress} />
            </ProfileSection>
          </div>
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

function ProfileSection(props: { children: JSX.Element | JSX.Element[]; title: string }) {
  return (
    <section className="customer-profile-section">
      <h3>{props.title}</h3>
      <div className="customer-profile-grid">{props.children}</div>
    </section>
  );
}

function ProfileInput(props: { label: string; onChange(value: string): void; required?: boolean; value: string }) {
  return (
    <label className="customer-profile-field">
      <span>
        {props.label}
        {props.required && <em>*</em>}
      </span>
      <input onChange={(event) => props.onChange(event.target.value)} value={props.value} />
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

function OverviewModule(props: { customers: Customer[]; store: Parameters<typeof summarizeAll>[1]; summary: ReturnType<typeof summarizeAll> }) {
  const [customerId, setCustomerId] = useState("");
  const [periodMonth, setPeriodMonth] = useState("");
  const [status, setStatus] = useState<StatementStatus | "">("");
  const periodOptions = getAvailablePeriods(props.store);
  const statementSummaries = props.store.monthlyStatements
    .map((statement) => summarizeStatement(statement, props.store))
    .filter((summary) => {
      const matchesCustomer = !customerId || summary.statement.customerId === customerId;
      const matchesPeriod = !periodMonth || summary.statement.periodMonth === periodMonth;
      const matchesStatus = !status || summary.status === status;
      return matchesCustomer && matchesPeriod && matchesStatus;
    });
  const filteredSummary = {
    receivableTotal: sumMoney(statementSummaries.map((item) => item.currentReceivable)),
    invoicedTotal: sumMoney(statementSummaries.map((item) => item.currentInvoiced)),
    paidTotal: sumMoney(statementSummaries.map((item) => item.currentReceived)),
    unpaidAmount: sumMoney(statementSummaries.map((item) => item.closingBalance)),
  };

  return (
    <div className="recon-workspace">
      <section className="recon-stat-grid">
        <StatCard label="应收总额" value={filteredSummary.receivableTotal} icon={Banknote} />
        <StatCard label="已开票总额" value={filteredSummary.invoicedTotal} icon={ReceiptText} />
        <StatCard label="已收款总额" value={filteredSummary.paidTotal} icon={CreditCard} />
        <StatCard label="未收余额" value={filteredSummary.unpaidAmount} icon={BarChart3} tone="warning" />
      </section>
      <section className="recon-simple-panel records-fill-page overview-records-page">
        <div className="recon-panel-head">
          <div>
            <span>客户月度余额总览</span>
            <strong>{statementSummaries.length} 张月度对账单</strong>
          </div>
        </div>
        <div className="module-filter-grid">
          <label>
            客户
            <AnimatedSelect
              ariaLabel="客户"
              onChange={setCustomerId}
              options={[{ label: "全部客户", value: "" }, ...props.customers.map((customer) => ({ label: customer.name, value: customer.id }))]}
              value={customerId}
            />
          </label>
          <label>
            对账月份
            <AnimatedSelect
              ariaLabel="对账月份"
              onChange={setPeriodMonth}
              options={[{ label: "全部月份", value: "" }, ...toSelectOptions(periodOptions)]}
              value={periodMonth}
            />
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
              setPeriodMonth("");
              setStatus("");
            }}
            type="button"
          >
            重置
          </button>
        </div>
        <table className="recon-table">
          <thead>
            <tr>
              <th>客户</th>
              <th>对账月份</th>
              <th>状态</th>
              <th>款号数量</th>
              <th>本月应收</th>
              <th>已开票</th>
              <th>已收款</th>
              <th>期末余额</th>
            </tr>
          </thead>
          <tbody>
            {statementSummaries.map((row) => (
              <tr key={row.statement.id}>
                <td>{getCustomerDisplayName(row.statement.customerId, props.store)}</td>
                <td>{row.statement.periodMonth}</td>
                <td>{row.status}</td>
                <td>{row.items.length}</td>
                <td>¥ {formatMoney(row.currentReceivable)}</td>
                <td>¥ {formatMoney(row.currentInvoiced)}</td>
                <td>¥ {formatMoney(row.currentReceived)}</td>
                <td className={row.closingBalance > 0 ? "is-danger" : "is-ok"}>¥ {formatMoney(row.closingBalance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>当前合计</td>
              <td>¥ {formatMoney(filteredSummary.receivableTotal)}</td>
              <td>¥ {formatMoney(filteredSummary.invoicedTotal)}</td>
              <td>¥ {formatMoney(filteredSummary.paidTotal)}</td>
              <td className={filteredSummary.unpaidAmount > 0 ? "is-danger" : "is-ok"}>¥ {formatMoney(filteredSummary.unpaidAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}

function ReceiptPoolModule(props: {
  allocations: ReceiptAllocation[];
  customers: Customer[];
  onAllocate(customerId: string): void;
  onImport(rows: ReceiptImportRow[], warnings: string[]): void;
  receipts: CustomerReceipt[];
}) {
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [periodMonth, setPeriodMonth] = useState("");
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [keyword, setKeyword] = useState("");
  const receiptPeriodOptions = Array.from(new Set(props.receipts.map((receipt) => receipt.periodMonth || receipt.receiptDate.slice(0, 7))))
    .filter(Boolean)
    .sort()
    .reverse();
  const filteredReceipts = selectedCustomerId
    ? props.receipts.filter((receipt) => receipt.customerId === selectedCustomerId)
    : props.receipts;
  const visibleReceipts = filteredReceipts.filter((receipt) => {
    const text = `${receipt.transactionNo ?? ""} ${receipt.note ?? ""}`.toLowerCase();
    const matchesPeriod = !periodMonth || (receipt.periodMonth || receipt.receiptDate.slice(0, 7)) === periodMonth;
    const matchesMethod = !method || receipt.method === method;
    const matchesKeyword = !keyword.trim() || text.includes(keyword.trim().toLowerCase());
    return matchesPeriod && matchesMethod && matchesKeyword;
  });
  const totalAmount = visibleReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
  const totalAllocated = visibleReceipts.reduce((sum, receipt) => sum + getReceiptAllocatedAmount(receipt.id, props.allocations), 0);
  const totalUnallocated = totalAmount - totalAllocated;

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
      <div className="recon-panel-head">
        <div>
          <span>全部收款记录</span>
          <strong>{visibleReceipts.length} 笔收款</strong>
        </div>
        <label className="recon-button recon-button-primary payment-import-trigger">
          <Upload size={16} />
          导入收款
          <input accept=".xlsx,.csv" onChange={importReceiptFile} type="file" />
        </label>
      </div>
      <div className="module-filter-grid">
        <label>
          客户
          <AnimatedSelect
            ariaLabel="客户"
            onChange={setSelectedCustomerId}
            options={[{ label: "全部客户", value: "" }, ...props.customers.map((customer) => ({ label: customer.name, value: customer.id }))]}
            value={selectedCustomerId}
          />
        </label>
        <label>
          归属账期
          <AnimatedSelect
            ariaLabel="归属账期"
            onChange={setPeriodMonth}
            options={[{ label: "全部账期", value: "" }, ...toSelectOptions(receiptPeriodOptions)]}
            value={periodMonth}
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
            setPeriodMonth("");
            setMethod("");
            setKeyword("");
          }}
          type="button"
        >
          重置
        </button>
      </div>
      <table className="recon-table">
        <thead>
          <tr>
            <th>客户</th>
            <th>收款日期</th>
            <th>收款金额</th>
            <th>已分配</th>
            <th>未分配</th>
            <th>收款方式</th>
            <th>流水号</th>
            <th>归属账期</th>
            <th>备注</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {visibleReceipts.map((receipt) => {
            const allocated = getReceiptAllocatedAmount(receipt.id, props.allocations);
            return (
              <tr key={receipt.id}>
                <td>{props.customers.find((customer) => customer.id === receipt.customerId)?.name ?? "-"}</td>
                <td>{receipt.receiptDate}</td>
                <td>¥ {formatMoney(receipt.amount)}</td>
                <td>¥ {formatMoney(allocated)}</td>
                <td className={receipt.amount - allocated > 0 ? "is-danger" : "is-ok"}>¥ {formatMoney(receipt.amount - allocated)}</td>
                <td>{receipt.method}</td>
                <td>{receipt.transactionNo || "-"}</td>
                <td>{receipt.periodMonth || "-"}</td>
                <td>{receipt.note || "-"}</td>
                <td>
                  <button className="recon-inline-action" onClick={() => props.onAllocate(receipt.customerId)} type="button">
                    分配
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>当前合计</td>
            <td>¥ {formatMoney(totalAmount)}</td>
            <td>¥ {formatMoney(totalAllocated)}</td>
            <td className={totalUnallocated > 0 ? "is-danger" : "is-ok"}>¥ {formatMoney(totalUnallocated)}</td>
            <td colSpan={5}></td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

function SettingsModule() {
  const auth = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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

  return (
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
  );
}

function InvoiceRecordsModule(props: { customers: Customer[]; styleAccounts: StyleAccount[] }) {
  const [customerId, setCustomerId] = useState("");
  const [periodMonth, setPeriodMonth] = useState("");
  const [styleKeyword, setStyleKeyword] = useState("");
  const [invoiceKeyword, setInvoiceKeyword] = useState("");
  const rows = props.styleAccounts.flatMap((account) =>
    account.invoiceRecords.map((record) => ({
      account,
      customer: props.customers.find((customer) => customer.id === account.customerId),
      record,
    })),
  );
  const periodOptions = Array.from(new Set(rows.map((row) => row.record.date.slice(0, 7)))).sort().reverse();
  const filteredRows = rows.filter(({ account, record }) => {
    const matchesCustomer = !customerId || account.customerId === customerId;
    const matchesPeriod = !periodMonth || record.date.slice(0, 7) === periodMonth;
    const matchesStyle = !styleKeyword.trim() || account.styleNo.toLowerCase().includes(styleKeyword.trim().toLowerCase());
    const matchesInvoice =
      !invoiceKeyword.trim() ||
      `${record.invoiceNo} ${record.remark ?? ""}`.toLowerCase().includes(invoiceKeyword.trim().toLowerCase());
    return matchesCustomer && matchesPeriod && matchesStyle && matchesInvoice;
  });
  const totalAmount = filteredRows.reduce((sum, row) => sum + row.record.amount, 0);

  return (
    <section className="recon-simple-panel records-fill-page invoice-records-page">
      <div className="recon-panel-head">
        <div>
          <span>全部开票记录</span>
          <strong>{filteredRows.length} 条记录</strong>
        </div>
      </div>
      <div className="module-filter-grid">
        <label>
          客户
          <AnimatedSelect
            ariaLabel="客户"
            onChange={setCustomerId}
            options={[{ label: "全部客户", value: "" }, ...props.customers.map((customer) => ({ label: customer.name, value: customer.id }))]}
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
          }}
          type="button"
        >
          重置
        </button>
      </div>
      <table className="recon-table">
        <thead>
          <tr>
            <th>客户</th>
            <th>款号</th>
            <th>开票日期</th>
            <th>发票号码</th>
            <th>开票金额</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.map(({ account, customer, record }) => (
            <tr key={record.id}>
              <td>{customer?.name ?? "-"}</td>
              <td>{account.styleNo}</td>
              <td>{record.date}</td>
              <td>{record.invoiceNo}</td>
              <td>¥ {formatMoney(record.amount)}</td>
              <td>{record.remark || "-"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>当前合计</td>
            <td>¥ {formatMoney(totalAmount)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
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

function StatementModal(props: {
  customers: Customer[];
  defaultCustomerId: string;
  getOpeningBalance(customerId: string, periodMonth: string): number;
  onClose(): void;
  onSubmit(values: { customerId: string; periodMonth: string; openingBalance: number; note: string }): void;
}) {
  const initialCustomerId = props.customers.some((customer) => customer.id === props.defaultCustomerId)
    ? props.defaultCustomerId
    : props.customers[0]?.id || "";
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [periodMonth, setPeriodMonth] = useState(getCurrentPeriod());
  const [openingBalance, setOpeningBalance] = useState(() => String(props.getOpeningBalance(initialCustomerId, getCurrentPeriod())));
  const [note, setNote] = useState("");

  function updatePeriod(nextCustomerId: string, nextPeriodMonth: string) {
    setCustomerId(nextCustomerId);
    setPeriodMonth(nextPeriodMonth);
    setOpeningBalance(String(props.getOpeningBalance(nextCustomerId, nextPeriodMonth)));
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
          <input disabled={!!props.item} onChange={(event) => setStyleNo(event.target.value)} placeholder="输入款号" value={styleNo} />
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
  transactionNo: string;
  periodMonth: string;
  note: string;
  createdAt?: string;
  isNew?: boolean;
};

function ReceiptPoolModal(props: {
  allocations: ReceiptAllocation[];
  customer?: Customer;
  onClose(): void;
  onSave(receipts: CustomerReceipt[], deletedReceiptIds: string[]): void;
  periods: string[];
  receipts: CustomerReceipt[];
}) {
  const periodOptions = Array.from(
    new Set([...props.periods, ...props.receipts.map((receipt) => receipt.periodMonth).filter(Boolean) as string[]]),
  ).sort().reverse();
  const [rows, setRows] = useState<ReceiptPoolRow[]>(() =>
    props.receipts.map((receipt) => ({
      id: receipt.id,
      receiptDate: receipt.receiptDate,
      amount: receipt.amount.toFixed(2),
      method: receipt.method,
      transactionNo: receipt.transactionNo ?? "",
      periodMonth: receipt.periodMonth ?? "",
      note: receipt.note ?? "",
      createdAt: receipt.createdAt,
    })),
  );
  const [deletedReceiptIds, setDeletedReceiptIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  function updateRow(rowId: string, patch: Partial<ReceiptPoolRow>) {
    setRows((currentRows) => currentRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((currentRows) => [
      ...currentRows,
      {
        id: createId("receipt"),
        receiptDate: getTodayString(),
        amount: "",
        method: "银行转账",
        transactionNo: "",
        periodMonth: periodOptions[0] ?? "",
        note: "",
        isNew: true,
      },
    ]);
  }

  function deleteRow(row: ReceiptPoolRow) {
    const allocatedAmount = getReceiptAllocatedAmount(row.id, props.allocations);
    if (
      allocatedAmount > 0 &&
      !window.confirm("该收款已分配到对账单或款号，删除后会影响对账结果，是否确认删除？")
    ) {
      return;
    }
    setRows((currentRows) => currentRows.filter((item) => item.id !== row.id));
    if (!row.isNew) {
      setDeletedReceiptIds((currentIds) => [...currentIds, row.id]);
    }
  }

  function saveRows() {
    if (!props.customer) return;
    const today = getTodayString();
    const nextReceipts: CustomerReceipt[] = [];

    for (const row of rows) {
      const amount = parseMoney(row.amount);
      const allocatedAmount = getReceiptAllocatedAmount(row.id, props.allocations);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.receiptDate)) {
        setError("收款日期必须使用 YYYY-MM-DD 格式。");
        return;
      }
      if (!row.amount.trim() || amount <= 0) {
        setError("收款金额不能为空，且必须大于 0。");
        return;
      }
      if (amount < allocatedAmount) {
        setError("已有分配记录的收款，修改后的收款金额不能小于已分配金额。");
        return;
      }

      nextReceipts.push({
        id: row.id,
        customerId: props.customer.id,
        receiptDate: row.receiptDate,
        amount,
        method: row.method,
        transactionNo: row.transactionNo.trim(),
        periodMonth: row.periodMonth,
        note: row.note.trim(),
        createdAt: row.createdAt ?? today,
        updatedAt: today,
      });
    }

    setError("");
    props.onSave(nextReceipts, deletedReceiptIds);
  }

  return (
    <Modal onClose={props.onClose} size="wide" title="收款池">
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
                <th>归属账期</th>
                <th>已分配金额</th>
                <th>未分配金额</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const allocatedAmount = getReceiptAllocatedAmount(row.id, props.allocations);
                const amount = parseMoney(row.amount);
                return (
                  <tr key={row.id}>
                    <td>
                      <input onChange={(event) => updateRow(row.id, { receiptDate: event.target.value })} type="date" value={row.receiptDate} />
                    </td>
                    <td>
                      <input
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
                        onChange={(value) => updateRow(row.id, { method: value as PaymentMethod })}
                        options={toSelectOptions(paymentMethods)}
                        value={row.method}
                      />
                    </td>
                    <td>
                      <input
                        onChange={(event) => updateRow(row.id, { transactionNo: event.target.value })}
                        placeholder="银行流水号/承兑编号"
                        value={row.transactionNo}
                      />
                    </td>
                    <td>
                      <AnimatedSelect
                        ariaLabel="归属账期"
                        onChange={(value) => updateRow(row.id, { periodMonth: value })}
                        options={[{ label: "未指定", value: "" }, ...toSelectOptions(periodOptions)]}
                        value={row.periodMonth}
                      />
                    </td>
                    <td>¥ {formatMoney(allocatedAmount)}</td>
                    <td className={amount - allocatedAmount > 0 ? "is-danger" : "is-ok"}>
                      ¥ {formatMoney(amount - allocatedAmount)}
                    </td>
                    <td>
                      <input onChange={(event) => updateRow(row.id, { note: event.target.value })} value={row.note} />
                    </td>
                    <td>
                      <div className="receipt-pool-actions">
                        <button className="recon-inline-action" type="button">
                          编辑
                        </button>
                        <button className="recon-inline-action is-danger" onClick={() => deleteRow(row)} type="button">
                          删除
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
          <button className="recon-button recon-button-light" onClick={addRow} type="button">
            <Plus size={16} />
            新增一行
          </button>
          {error && <span className="receipt-pool__error">{error}</span>}
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
  );
}

function AllocationModal(props: {
  customerId: string;
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
  const [receiptId, setReceiptId] = useState(customerReceipts[0]?.id ?? "");
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
  const openingBalance = props.statementSummary.realtimeOpeningBalance;
  const currentTotal = props.statementSummary.styleReceivableTotal;
  const adjustmentNetTotal = roundMoney(props.statementSummary.increaseAdjustmentTotal - props.statementSummary.decreaseAdjustmentTotal);
  const grandTotal = props.statementSummary.grandTotal;
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

function Modal(props: { children: JSX.Element; onClose(): void; size?: "wide"; title: string }) {
  return (
    <div className="recon-modal-backdrop" role="presentation">
      <div aria-modal="true" className={`recon-modal ${props.size === "wide" ? "recon-modal-wide" : ""}`} role="dialog">
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
