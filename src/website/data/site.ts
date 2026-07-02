import {
  BadgeCheck,
  Boxes,
  Droplets,
  Factory,
  FlaskConical,
  Globe2,
  Leaf,
  PackageCheck,
  Ruler,
  Shirt,
  Sparkles,
  StretchHorizontal,
  Waves,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
};

export type Fabric = {
  slug: string;
  name: string;
  cnName: string;
  description: string;
  composition: string;
  weight: string;
  width: string;
  finish: string;
  applications: string[];
};

export type Feature = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { label: "首页", href: "/" },
  { label: "产品面料", href: "/products" },
  { label: "应用场景", href: "/applications" },
  { label: "技术研发", href: "/technology" },
  { label: "可持续", href: "/sustainability" },
  { label: "关于我们", href: "/about" },
  { label: "联系我们", href: "/contact" },
];

export const fabrics: Fabric[] = [
  {
    slug: "single-jersey",
    name: "Single Jersey",
    cnName: "汗布",
    description: "柔软、亲肤、版型适应性强，适合 T 恤、打底衫和潮牌基础款。",
    composition: "棉 / 涤纶 / 氨纶等多种配比",
    weight: "140-260 GSM",
    width: "160-190 CM",
    finish: "磨毛、酵素洗、抗起球",
    applications: ["T 恤", "宽松上衣", "基础打底"],
  },
  {
    slug: "french-terry",
    name: "French Terry",
    cnName: "毛圈布",
    description: "圈底结构舒适有厚度，适合卫衣、套装、运动休闲和街头系列。",
    composition: "棉混纺 / CVC / 再生涤",
    weight: "260-420 GSM",
    width: "165-185 CM",
    finish: "抓毛、紧密整理、硅油柔软",
    applications: ["卫衣", "运动裤", "街头套装"],
  },
  {
    slug: "scuba",
    name: "Scuba Knit",
    cnName: "空气层",
    description: "立体双面结构，表面干净、支撑感好，适合现代廓形单品。",
    composition: "涤纶 / 人棉 / 氨纶可定制",
    weight: "280-380 GSM",
    width: "150-175 CM",
    finish: "顺滑手感、挺括保形",
    applications: ["结构上衣", "轻夹克", "极简套装"],
  },
  {
    slug: "ponte-roma",
    name: "Ponte Roma",
    cnName: "罗马布",
    description: "稳定、平整、弹性适中，适合精致休闲、裤装和品牌基础系列。",
    composition: "人棉锦氨 / 涤粘等配比",
    weight: "220-360 GSM",
    width: "150-170 CM",
    finish: "抗起球、平整紧密",
    applications: ["裤装", "连衣裙", "精致制服"],
  },
  {
    slug: "rib-knit",
    name: "Rib Knit",
    cnName: "螺纹",
    description: "弹性和回复性好，适合领口、袖口、下摆和修身廓形。",
    composition: "棉氨 / 涤氨等配比",
    weight: "180-360 GSM",
    width: "90-160 CM",
    finish: "高回复、柔软手感",
    applications: ["领口", "袖口", "背心"],
  },
];

export const performanceFeatures: Feature[] = [
  {
    title: "潮牌手感",
    description: "柔软、厚实、结构稳定，适合高品质休闲和街头系列。",
    icon: Sparkles,
  },
  {
    title: "弹力结构可选",
    description: "支持不同弹力、回复性和穿着舒适度的针织结构开发。",
    icon: StretchHorizontal,
  },
  {
    title: "后整理控制",
    description: "可做吸湿速干、抗起球、磨毛、抓毛、硅油柔软等整理。",
    icon: Droplets,
  },
  {
    title: "外贸交付支持",
    description: "提供样卡、色样、测试报告、包装和买手沟通支持。",
    icon: Globe2,
  },
];

export const capabilityFeatures: Feature[] = [
  {
    title: "面料开发",
    description: "根据品牌需求调整纱线、成分、克重、弹力和手感。",
    icon: FlaskConical,
  },
  {
    title: "规格管理",
    description: "从样品到大货持续跟进门幅、克重、缩水率和色牢度。",
    icon: Ruler,
  },
  {
    title: "贸易交付",
    description: "打样、生产跟进、验货和出货协调形成完整流程。",
    icon: PackageCheck,
  },
];

export const sustainabilityFeatures: Feature[] = [
  {
    title: "再生纤维选择",
    description: "支持再生涤、再生锦等更低影响的面料方案。",
    icon: Leaf,
  },
  {
    title: "认证资料配合",
    description: "按客户要求配合标准、测试和相关文件准备。",
    icon: BadgeCheck,
  },
  {
    title: "更清洁的整理",
    description: "在耐洗、手感、功能和合规之间寻找更好的平衡。",
    icon: Waves,
  },
];

export const tradeSteps: Feature[] = [
  {
    title: "需求沟通",
    description: "了解目标服装、价格带、手感、性能和交期要求。",
    icon: Shirt,
  },
  {
    title: "开发打样",
    description: "准备样布、色样、整理测试和规格建议。",
    icon: Zap,
  },
  {
    title: "生产跟进",
    description: "协调织造、染整、检验和出货细节。",
    icon: Factory,
  },
  {
    title: "复单支持",
    description: "沉淀色卡、面料资料和后续补单沟通。",
    icon: Boxes,
  },
];
