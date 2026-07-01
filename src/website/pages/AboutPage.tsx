import {
  BadgeCheck,
  Factory,
  Gauge,
  Handshake,
  Microscope,
  Network,
  Scissors,
  Shirt,
  Sparkles,
} from "lucide-react";
import { SectionHeader } from "../components/SectionHeader";

type ChainStage = {
  step: string;
  title: string;
  subtitle: string;
  description: string;
  visual: "cotton" | "yarn" | "knit" | "dye" | "inspect" | "garment";
  points: string[];
};

const strengths = [
  {
    title: "专注针织面料",
    description: "围绕汗布、毛圈布、空气层、罗马布、螺纹等品类，服务潮牌和现代休闲品牌。",
    icon: Sparkles,
  },
  {
    title: "重视开发细节",
    description: "从克重、门幅、手感、弹力到后整理，帮助客户把设计语言落到具体面料规格。",
    icon: Gauge,
  },
  {
    title: "长期供应链协作",
    description: "与纱线、织造、染整、检验和成衣伙伴保持稳定合作，减少沟通和交付不确定性。",
    icon: Network,
  },
];

const chainStages: ChainStage[] = [
  {
    step: "01",
    title: "棉花 / 纤维原料",
    subtitle: "源头决定面料的基础质感。",
    description:
      "我们关注原料稳定性、纤维手感和成分选择。对于不同品牌需求，可配合棉、再生纤维、功能纤维等方案。",
    visual: "cotton",
    points: ["原料稳定", "成分选择", "手感基础"],
  },
  {
    step: "02",
    title: "纱线开发",
    subtitle: "从纱线开始控制风格和性能。",
    description:
      "纱支、捻度、强力和混纺比例会影响布面、弹力和穿着体验。我们会根据目标服装建议合适的纱线方向。",
    visual: "yarn",
    points: ["纱支建议", "混纺比例", "强力与毛羽控制"],
  },
  {
    step: "03",
    title: "针织织造",
    subtitle: "把纱线变成稳定的针织结构。",
    description:
      "这一环节是针织面料的核心。汗布、毛圈、空气层、罗马布和螺纹都需要稳定的织造控制和结构理解。",
    visual: "knit",
    points: ["结构开发", "门幅克重", "弹力回复"],
  },
  {
    step: "04",
    title: "染色与后整理",
    subtitle: "颜色、手感和功能在这里被塑造。",
    description:
      "染整决定色彩表现、缩水率、色牢度和最终手感。我们重视实验室色样、大货颜色和后整理稳定性。",
    visual: "dye",
    points: ["色样跟进", "缩水控制", "功能整理"],
  },
  {
    step: "05",
    title: "成品面料检验",
    subtitle: "这是我们尤其重视的关键环节。",
    description:
      "在成品面料交付前，我们关注布面瑕疵、色差、克重、门幅和包装。未来这里可以升级成最酷的动态检测场景。",
    visual: "inspect",
    points: ["布面检验", "瑕疵标记", "规格复核"],
  },
  {
    step: "06",
    title: "成衣厂协同",
    subtitle: "让面料更顺利地走向成衣。",
    description:
      "对于需要成衣落地支持的客户，我们可协同长期合作的成衣厂资源，帮助推进裁剪、打样和批量生产沟通。",
    visual: "garment",
    points: ["成熟成衣伙伴", "裁剪打样", "链路沟通"],
  },
];

function StageVisual({ type }: { type: ChainStage["visual"] }) {
  return (
    <div className={`stage-visual stage-visual--${type}`} aria-hidden="true">
      {type === "cotton" ? (
        <>
          <span className="leaf" />
          <span className="cotton cotton-one" />
          <span className="cotton cotton-two" />
          <span className="cotton cotton-three" />
          <span className="motion-line motion-line-one" />
        </>
      ) : null}

      {type === "yarn" ? (
        <>
          <span className="mini-machine" />
          <span className="yarn-spool yarn-spool-one" />
          <span className="yarn-spool yarn-spool-two" />
          <span className="thread-line" />
        </>
      ) : null}

      {type === "knit" ? (
        <>
          <span className="knit-machine" />
          <span className="machine-ring ring-one" />
          <span className="machine-ring ring-two" />
          <span className="cloth-roll cloth-roll-natural" />
        </>
      ) : null}

      {type === "dye" ? (
        <>
          <span className="dye-vat" />
          <span className="fabric-sheet fabric-sheet-natural" />
          <span className="fabric-sheet fabric-sheet-color" />
          <span className="bubble bubble-one" />
          <span className="bubble bubble-two" />
        </>
      ) : null}

      {type === "inspect" ? (
        <>
          <span className="inspection-table" />
          <span className="inspector" />
          <span className="robot-arm" />
          <span className="defect-sticker sticker-one" />
          <span className="defect-sticker sticker-two" />
          <span className="scan-screen">检测中</span>
        </>
      ) : null}

      {type === "garment" ? (
        <>
          <span className="cutting-table" />
          <span className="flying-fabric" />
          <span className="cut-line cut-line-one" />
          <span className="cut-line cut-line-two" />
          <Shirt className="garment-icon" size={62} />
          <Scissors className="scissors-icon" size={34} />
        </>
      ) : null}
    </div>
  );
}

export function AboutPage() {
  return (
    <div className="about-page">
      <section className="about-hero">
        <div className="about-hero__content">
          <span className="eyebrow">关于臻林纺织</span>
          <h1>我们专注针织面料，也关注面料背后的完整链路。</h1>
          <p>
            臻林纺织是一家服务潮牌、设计师品牌、买手和服装贸易客户的针织面料供应商。我们主营汗布、毛圈布、空气层、罗马布、螺纹等品类，
            同时与稳定的供应链伙伴保持长期协作，帮助客户更可靠地完成从面料开发到成衣落地的沟通。
          </p>
        </div>
        <div className="about-hero__media">
          <img src="/assets/website/fabric-tech.png" alt="面料开发与检测场景" />
        </div>
      </section>

      <section className="about-strengths">
        {strengths.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.title}>
              <span>
                <Icon size={22} />
              </span>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
            </article>
          );
        })}
      </section>

      <section className="supply-chain-section">
        <div className="supply-chain-intro">
          <SectionHeader
            eyebrow="全链路面料供应链"
            title="从棉花到成衣，我们关注每一个关键环节。"
            description="臻林纺织主营针织面料开发与供应，但我们深知一块好面料来自完整产业链的稳定协作。这个页面先做成静态故事线，后续可以逐步加入滚动动画和更真实的场景图片。"
          />
          <div className="chain-note">
            <Microscope size={22} />
            <p>
              表达重点不是“所有环节都由我们自有生产”，而是我们谨慎筛选供应商、密切协作，并在关键节点参与跟进。
            </p>
          </div>
        </div>

        <div className="chain-timeline">
          {chainStages.map((stage) => (
            <article className="chain-stage" key={stage.step}>
              <div className="chain-stage__copy">
                <span>{stage.step}</span>
                <h2>{stage.title}</h2>
                <strong>{stage.subtitle}</strong>
                <p>{stage.description}</p>
                <ul>
                  {stage.points.map((point) => (
                    <li key={point}>
                      <BadgeCheck size={15} /> {point}
                    </li>
                  ))}
                </ul>
              </div>
              <StageVisual type={stage.visual} />
            </article>
          ))}
        </div>
      </section>

      <section className="chain-service-band">
        <div>
          <span className="eyebrow">成熟协作网络</span>
          <h2>主营面料，但不止于面料。</h2>
          <p>
            当客户需要更完整的供应链支持时，我们可以协同长期合作的纱线、织造、染整、检验和成衣伙伴，
            帮助品牌更顺畅地推进开发、打样和交付。
          </p>
        </div>
        <div className="service-badges">
          <span>
            <Handshake size={18} /> 长期合作伙伴
          </span>
          <span>
            <Factory size={18} /> 供应链协同
          </span>
          <span>
            <Shirt size={18} /> 成衣资源支持
          </span>
        </div>
      </section>
    </div>
  );
}
