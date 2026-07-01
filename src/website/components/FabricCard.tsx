import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import type { Fabric } from "../data/site";

type FabricCardProps = {
  fabric: Fabric;
  index: number;
};

export function FabricCard({ fabric, index }: FabricCardProps) {
  return (
    <Link className="fabric-card" to={`/products/${fabric.slug}`}>
      <div className={`fabric-card__media fabric-tone-${(index % 5) + 1}`}>
        <img src="/assets/website/fabric-card.png" alt={`${fabric.name} texture`} />
      </div>
      <div className="fabric-card__body">
        <div>
          <span>{fabric.cnName}</span>
          <h3>{fabric.name}</h3>
        </div>
        <Plus aria-hidden="true" size={18} />
      </div>
      <p>{fabric.description}</p>
    </Link>
  );
}
