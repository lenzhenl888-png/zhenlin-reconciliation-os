import { DEFAULT_TESTING_STANDARDS } from "../constants/testingStandards";
import type { ColorRow, DyeingPlan, DyeingPlanType, FabricColumn, TestingStandard } from "../models/dyeingPlan";
import { dyeingPlanRepository } from "../repositories/dyeingPlanRepository";
import { todayString } from "../utils/date";
import { createId } from "../utils/id";
import { toNumber } from "../utils/number";

export function createFabricColumn(role: FabricColumn["role"]): FabricColumn {
  return {
    id: createId(role === "main" ? "main" : "acc"),
    role,
    unit: "米",
  };
}

export function createColorRow(fabricIds: string[]): ColorRow {
  return {
    id: createId("color"),
    quantities: fabricIds.reduce<Record<string, string>>((result, id) => {
      result[id] = "";
      return result;
    }, {}),
  };
}

export function createTestingStandard(): TestingStandard {
  return { name: "", range: "", requirement: "", note: "" };
}

export function createEmptyDyeingPlan(type: DyeingPlanType = "sample"): DyeingPlan {
  const mainFabrics = [createFabricColumn("main")];
  const accessories = [createFabricColumn("accessory")];
  const fabricIds = [...mainFabrics, ...accessories].map((fabric) => fabric.id);
  const now = new Date().toISOString();

  return {
    id: createId("plan"),
    planNo: createPlanNo(),
    type,
    customerName: "",
    planDate: todayString(),
    status: "草稿",
    isReviewed: false,
    isCompleted: false,
    mainFabrics,
    accessories,
    colorRows: [createColorRow(fabricIds), createColorRow(fabricIds), createColorRow(fabricIds)],
    processText: "",
    testingStandards: DEFAULT_TESTING_STANDARDS.map((standard) => ({ ...standard })),
    remark: "",
    createdAt: now,
    updatedAt: now,
  };
}

export async function listDyeingPlans(type?: DyeingPlanType) {
  const plans = await dyeingPlanRepository.list();
  return type ? plans.filter((plan) => plan.type === type) : plans;
}

export async function getDyeingPlan(id: string) {
  return dyeingPlanRepository.getById(id);
}

export async function saveDyeingPlan(plan: DyeingPlan) {
  return dyeingPlanRepository.save({
    ...ensureQuantityKeys(plan),
    status: plan.isCompleted ? "已完成" : plan.isReviewed ? "已审核" : "已保存",
    updatedAt: new Date().toISOString(),
  });
}

export function setPlanType(plan: DyeingPlan, type: DyeingPlanType): DyeingPlan {
  return { ...plan, type };
}

export function addFabric(plan: DyeingPlan, role: FabricColumn["role"]): DyeingPlan {
  const fabric = createFabricColumn(role);
  const key = role === "main" ? "mainFabrics" : "accessories";

  return {
    ...plan,
    [key]: [...plan[key], fabric],
    colorRows: plan.colorRows.map((row) => ({
      ...row,
      quantities: { ...row.quantities, [fabric.id]: "" },
    })),
  };
}

export function removeFabric(plan: DyeingPlan, role: FabricColumn["role"], fabricId: string): DyeingPlan {
  const key = role === "main" ? "mainFabrics" : "accessories";
  if (plan[key].length <= 1) return plan;

  return {
    ...plan,
    [key]: plan[key].filter((fabric) => fabric.id !== fabricId),
    colorRows: plan.colorRows.map((row) => {
      const { [fabricId]: _removed, ...quantities } = row.quantities;
      return { ...row, quantities };
    }),
  };
}

export function addColorRow(plan: DyeingPlan): DyeingPlan {
  const fabricIds = [...plan.mainFabrics, ...plan.accessories].map((fabric) => fabric.id);
  return { ...plan, colorRows: [...plan.colorRows, createColorRow(fabricIds)] };
}

export function removeColorRow(plan: DyeingPlan, rowId: string): DyeingPlan {
  if (plan.colorRows.length <= 1) return plan;
  return { ...plan, colorRows: plan.colorRows.filter((row) => row.id !== rowId) };
}

export function addTestingStandard(plan: DyeingPlan): DyeingPlan {
  return {
    ...plan,
    testingStandards: [...(plan.testingStandards ?? []), createTestingStandard()],
  };
}

export function removeTestingStandard(plan: DyeingPlan, index: number): DyeingPlan {
  return {
    ...plan,
    testingStandards: (plan.testingStandards ?? []).filter((_, itemIndex) => itemIndex !== index),
  };
}

export function calculateColorRowTotal(plan: DyeingPlan, row: ColorRow) {
  return getAllFabricIds(plan).reduce((total, fabricId) => total + toNumber(row.quantities[fabricId]), 0);
}

export function calculatePlanTotal(plan: DyeingPlan) {
  return plan.colorRows.reduce((total, row) => total + calculateColorRowTotal(plan, row), 0);
}

export function getAllFabricIds(plan: DyeingPlan) {
  return [...plan.mainFabrics, ...plan.accessories].map((fabric) => fabric.id);
}

function ensureQuantityKeys(plan: DyeingPlan): DyeingPlan {
  const fabricIds = getAllFabricIds(plan);
  return {
    ...plan,
    colorRows: plan.colorRows.map((row) => ({
      ...row,
      quantities: fabricIds.reduce<Record<string, number | string>>((result, fabricId) => {
        result[fabricId] = row.quantities[fabricId] ?? "";
        return result;
      }, {}),
    })),
  };
}

function createPlanNo() {
  const date = todayString().replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DP-${date}-${suffix}`;
}
