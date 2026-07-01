import { listDyeingPlans } from "./dyeingPlanService";

export function listProductionOrders() {
  return listDyeingPlans("production");
}
