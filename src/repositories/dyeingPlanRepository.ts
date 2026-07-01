import type { DyeingPlan } from "../models/dyeingPlan";
import { readJson, writeJson } from "./localStorageRepository";

const STORAGE_KEY = "zhenlin:dyeing-plans";

export type DyeingPlanRepository = {
  list: () => Promise<DyeingPlan[]>;
  getById: (id: string) => Promise<DyeingPlan | undefined>;
  save: (plan: DyeingPlan) => Promise<DyeingPlan>;
  remove: (id: string) => Promise<void>;
};

function readPlans() {
  return readJson<DyeingPlan[]>(STORAGE_KEY, []);
}

function writePlans(plans: DyeingPlan[]) {
  writeJson(STORAGE_KEY, plans);
}

export const dyeingPlanRepository: DyeingPlanRepository = {
  async list() {
    return readPlans().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async getById(id) {
    return readPlans().find((plan) => plan.id === id);
  },

  async save(plan) {
    const plans = readPlans();
    const index = plans.findIndex((item) => item.id === plan.id);

    if (index >= 0) {
      plans[index] = plan;
    } else {
      plans.push(plan);
    }

    writePlans(plans);
    return plan;
  },

  async remove(id) {
    writePlans(readPlans().filter((plan) => plan.id !== id));
  },
};
