import { SectionHeader } from "../components/SectionHeader";

const applications = ["潮牌街头", "卫衣与套装", "高级基础款", "运动休闲", "轻户外休闲", "领口袖口螺纹"];

export function ApplicationsPage() {
  return (
    <section className="page-section inner-page">
      <SectionHeader
        eyebrow="应用场景"
        title="按服装用途组织面料选择。"
        description="这个页面后续可以把服装类别、推荐面料结构、克重范围和后整理建议关联起来，方便客户快速询样。"
      />
      <div className="application-grid application-grid--large">
        {applications.map((item) => (
          <article key={item}>
            <span>{item}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
