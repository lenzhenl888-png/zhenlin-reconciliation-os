import { ArrowRight, Download, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { FabricCard } from "../components/FabricCard";
import { FeatureItem } from "../components/FeatureItem";
import { SectionHeader } from "../components/SectionHeader";
import {
  capabilityFeatures,
  fabrics,
  performanceFeatures,
  sustainabilityFeatures,
  tradeSteps,
} from "../data/site";

export function HomePage() {
  return (
    <div className="home-page">
      <section className="hero-section">
        <img className="hero-section__image" src="/assets/website/fabric-hero.png" alt="高端针织面料微距纹理" />
        <div className="hero-section__overlay" />
        <div className="hero-section__content">
          <span className="eyebrow">为潮牌与现代服装品牌开发针织面料</span>
          <h1>高级针织面料，为品牌系列而开发。</h1>
          <p>
            臻林纺织专注汗布、毛圈布、空气层、罗马布、螺纹等针织面料，为服装品牌、设计师、买手和贸易客户提供稳定的面料开发与供应服务。
          </p>
          <div className="hero-actions">
            <Link className="button button--primary" to="/products">
              查看面料 <ArrowRight size={17} />
            </Link>
            <Link className="button button--ghost" to="/contact">
              索取样布
            </Link>
          </div>
        </div>
        <div className="hero-panel">
          <span>技术关注点</span>
          <ul>
            <li>克重与门幅控制</li>
            <li>柔软手感开发</li>
            <li>适合潮牌的结构与厚度</li>
            <li>样品到大货稳定性</li>
          </ul>
        </div>
      </section>

      <section className="performance-strip">
        <h2>摸得到的面料表现</h2>
        {performanceFeatures.map((feature) => (
          <FeatureItem key={feature.title} feature={feature} compact />
        ))}
      </section>

      <section className="page-section fabric-showcase">
        <SectionHeader
          eyebrow="核心针织面料"
          title="适合潮牌、休闲装和品牌基础款的面料品类。"
          description="先用清晰的面料分类帮助客户快速判断方向，后续可继续扩展真实 SKU、色卡、现货与定制开发。"
        />
        <div className="fabric-grid">
          {fabrics.map((fabric, index) => (
            <FabricCard key={fabric.slug} fabric={fabric} index={index} />
          ))}
        </div>
      </section>

      <section className="spec-section">
        <div className="spec-image spec-image--blue" />
        <div className="spec-card">
          <span className="eyebrow">成分与规格</span>
          <h2>毛圈布开发基础方案</h2>
          <dl>
            <div>
              <dt>成分</dt>
              <dd>80% 棉 / 20% 涤纶，可按需求调整配比</dd>
            </div>
            <div>
              <dt>克重</dt>
              <dd>320 GSM +/- 5%</dd>
            </div>
            <div>
              <dt>门幅</dt>
              <dd>175 CM</dd>
            </div>
            <div>
              <dt>整理</dt>
              <dd>硅油柔软、酵素洗、抗起球、抓毛可选</dd>
            </div>
          </dl>
          <a className="text-link" href="/products/french-terry">
            查看面料详情 <Download size={16} />
          </a>
        </div>
        <img className="spec-photo" src="/assets/website/fabric-tech.png" alt="面料检测与开发工具" />
        <div className="spec-benefits">
          {capabilityFeatures.map((feature) => (
            <FeatureItem key={feature.title} feature={feature} compact />
          ))}
        </div>
      </section>

      <section className="page-section split-section">
        <div>
          <SectionHeader
            eyebrow="应用场景"
            title="从卫衣、T 恤到套装和品牌基础款。"
            description="网站结构会帮助客户从服装用途快速找到合适的针织面料，而不是只看到一堆工厂介绍。"
          />
          <Link className="text-link" to="/applications">
            查看应用场景 <ArrowRight size={16} />
          </Link>
        </div>
        <div className="application-grid">
          {["宽松 T 恤", "卫衣套装", "街头裤装", "领口袖口螺纹"].map((item) => (
            <article key={item}>
              <span>{item}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="page-section technology-section">
        <SectionHeader
          eyebrow="可持续与技术"
          title="更清洁的选择，也要有真实的规格控制。"
          description="这里可以展示再生纱线、客户要求的认证资料、测试标准、后整理能力和面料开发流程。"
        />
        <div className="icon-grid">
          {sustainabilityFeatures.map((feature) => (
            <FeatureItem key={feature.title} feature={feature} />
          ))}
        </div>
      </section>

      <section className="page-section trade-section">
        <div>
          <SectionHeader
            eyebrow="外贸服务流程"
            title="从样布需求到大货出运。"
            description="为品牌团队、设计工作室、买手和贸易客户提供清晰的合作流程。"
          />
        </div>
        <div className="trade-steps">
          {tradeSteps.map((step, index) => (
            <article key={step.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <FeatureItem feature={step} compact />
            </article>
          ))}
        </div>
      </section>

      <section className="factory-band">
        <div>
          <span className="eyebrow">工厂与供应能力</span>
          <h2>能力要可靠，呈现要克制。</h2>
          <p>
            工厂能力在这里作为信任背书出现：产能、验货、生产协调和交付稳定性支撑面料故事，但不抢走产品本身的重点。
          </p>
        </div>
        <div className="metric-grid">
          <strong>20+</strong>
          <span>年面料经验</span>
          <strong>50+</strong>
          <span>服务买家市场</span>
          <strong>5M+</strong>
          <span>月度供应能力</span>
        </div>
        <ShieldCheck aria-hidden="true" size={44} />
      </section>
    </div>
  );
}
