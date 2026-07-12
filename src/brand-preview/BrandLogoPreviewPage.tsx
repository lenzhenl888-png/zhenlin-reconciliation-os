import { Strands } from "../components/common/Strands";
import "./brand-logo-preview.css";

export function BrandLogoPreviewPage() {
  return (
    <main className="brand-preview-page">
      <section className="brand-logo-scene" aria-label="臻林蓝色动态品牌标志预览">
        <img className="brand-logo-base" src="/zhenlin-logo-structure.png" alt="臻林 ZL 标志" />
        <div className="brand-wave-mask" aria-hidden="true">
          <Strands
            colors={["#1d4ed8", "#2563eb", "#38bdf8", "#bfdbfe"]}
            speed={0.38}
            amplitude={0.28}
            waviness={1.18}
            thickness={0.027}
            glow={3.8}
            spread={0.82}
            opacity={1}
            scale={1.28}
          />
        </div>
      </section>
    </main>
  );
}
