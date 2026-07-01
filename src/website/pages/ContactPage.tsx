import { Mail, MapPin, Phone } from "lucide-react";
import { SectionHeader } from "../components/SectionHeader";

export function ContactPage() {
  return (
    <section className="page-section contact-page">
      <SectionHeader
        eyebrow="联系我们 / 索取样布"
        title="从一份面料需求或样布申请开始。"
        description="当前是前端表单框架，后续可以接入邮箱、CRM、企业微信或样布申请数据库。"
      />
      <div className="contact-grid">
        <form className="sample-form">
          <label>
            姓名
            <input type="text" placeholder="请输入姓名" />
          </label>
          <label>
            公司 / 品牌
            <input type="text" placeholder="品牌、工作室、贸易公司或买手办公室" />
          </label>
          <label>
            邮箱
            <input type="email" placeholder="name@company.com" />
          </label>
          <label>
            感兴趣的面料
            <select>
              <option>毛圈布 / French Terry</option>
              <option>汗布 / Single Jersey</option>
              <option>空气层 / Scuba Knit</option>
              <option>罗马布 / Ponte Roma</option>
              <option>螺纹 / Rib Knit</option>
            </select>
          </label>
          <label className="sample-form__wide">
            需求说明
            <textarea placeholder="目标服装、克重、成分、颜色、后整理、预计数量、交期要求等" />
          </label>
          <button className="button button--primary sample-form__wide" type="button">
            发送需求
          </button>
        </form>
        <aside className="contact-card">
          <h2>供应商联系方式</h2>
          <p>这里可以替换成你公司的真实邮箱、电话、微信和办公地址。</p>
          <span>
            <Mail size={18} /> sales@zhenlin-textiles.com
          </span>
          <span>
            <Phone size={18} /> +86 21 1234 5678
          </span>
          <span>
            <MapPin size={18} /> 中国 / 针织面料供应
          </span>
        </aside>
      </div>
    </section>
  );
}
