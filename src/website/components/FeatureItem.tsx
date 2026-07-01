import type { Feature } from "../data/site";

type FeatureItemProps = {
  feature: Feature;
  compact?: boolean;
};

export function FeatureItem({ feature, compact = false }: FeatureItemProps) {
  const Icon = feature.icon;

  return (
    <article className={compact ? "feature-item feature-item--compact" : "feature-item"}>
      <span className="feature-item__icon">
        <Icon aria-hidden="true" size={compact ? 19 : 22} />
      </span>
      <div>
        <h3>{feature.title}</h3>
        <p>{feature.description}</p>
      </div>
    </article>
  );
}
