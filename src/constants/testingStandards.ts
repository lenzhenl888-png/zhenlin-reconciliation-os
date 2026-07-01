import type { TestingStandard } from "../models/dyeingPlan";

export const DEFAULT_TESTING_STANDARDS: TestingStandard[] = [
  { name: "色牢度", range: "常规", requirement: "按客户标准", note: "" },
  { name: "缩水率", range: "经纬向", requirement: "按合同要求", note: "" },
  { name: "克重", range: "g/m²", requirement: "允许公差内", note: "" },
];
