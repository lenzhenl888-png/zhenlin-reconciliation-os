import { listDyeingPlans } from "./dyeingPlanService";

export function listSampleOrders() {
  return listDyeingPlans("sample");
}
