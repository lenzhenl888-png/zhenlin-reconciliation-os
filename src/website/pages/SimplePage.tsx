import { SectionHeader } from "../components/SectionHeader";

type SimplePageProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function SimplePage({ eyebrow, title, description }: SimplePageProps) {
  return (
    <section className="page-section inner-page">
      <SectionHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="placeholder-panel">
        <p>
          页面框架已经准备好。下一轮可以继续加入真实照片、认证资料、产品数据、买家常见问题、下载资料和 SEO 文案。
        </p>
      </div>
    </section>
  );
}
