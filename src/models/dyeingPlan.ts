export type DyeingPlanType = "sample" | "production";

export type DyeingPlan = {
  id: string;
  planNo: string;
  type: DyeingPlanType;

  customerName: string;
  styleNo?: string;
  contractNo?: string;
  orderNo?: string;

  planDate: string;
  expectedDeliveryDate?: string;

  status: string;
  isReviewed: boolean;
  isCompleted: boolean;

  mainFabrics: FabricColumn[];
  accessories: FabricColumn[];
  colorRows: ColorRow[];

  processText?: string;
  testingStandards?: TestingStandard[];
  remark?: string;

  owner?: string;
  weavingFactory?: string;
  dyeingFactory?: string;
  internalRemark?: string;

  createdAt: string;
  updatedAt: string;
};

export type FabricColumn = {
  id: string;
  role: "main" | "accessory";
  fabricCode?: string;
  fabricName?: string;
  width?: string;
  weight?: string;
  unit?: "公斤" | "米";
  process?: string;
};

export type ColorRow = {
  id: string;
  colorName?: string;
  tcxCode?: string;
  dyeFactoryColorCode?: string;
  itemName?: string;
  remark?: string;
  quantities: Record<string, number | string>;
};

export type TestingStandard = {
  name: string;
  range?: string;
  requirement?: string;
  note?: string;
};
