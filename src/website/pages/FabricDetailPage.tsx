import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { fabrics } from "../data/site";

export function FabricDetailPage() {
  const { slug } = useParams();
  const fabric = fabrics.find((item) => item.slug === slug) ?? fabrics[0];

  return (
    <section className="page-section detail-page">
      <Link className="text-link" to="/products">
        <ArrowLeft size={16} /> 返回面料列表
      </Link>
      <div className="detail-hero">
        <img src="/assets/website/fabric-card.png" alt={`${fabric.cnName}面料细节`} />
        <div>
          <span className="eyebrow">{fabric.cnName}</span>
          <h1>{fabric.name}</h1>
          <p>{fabric.description}</p>
          <dl>
            <div>
              <dt>成分</dt>
              <dd>{fabric.composition}</dd>
            </div>
            <div>
              <dt>克重</dt>
              <dd>{fabric.weight}</dd>
            </div>
            <div>
              <dt>门幅</dt>
              <dd>{fabric.width}</dd>
            </div>
            <div>
              <dt>整理</dt>
              <dd>{fabric.finish}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
