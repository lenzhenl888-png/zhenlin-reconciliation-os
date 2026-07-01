import { FabricCard } from "../components/FabricCard";
import { SectionHeader } from "../components/SectionHeader";
import { fabrics } from "../data/site";

export function ProductsPage() {
  return (
    <section className="page-section inner-page">
      <SectionHeader
        eyebrow="产品面料"
        title="核心针织面料库。"
        description="当前已搭好产品路由和卡片结构，后续可以替换为真实 SKU、色卡、现货计划和规格书下载。"
      />
      <div className="fabric-grid">
        {fabrics.map((fabric, index) => (
          <FabricCard key={fabric.slug} fabric={fabric} index={index} />
        ))}
      </div>
    </section>
  );
}
