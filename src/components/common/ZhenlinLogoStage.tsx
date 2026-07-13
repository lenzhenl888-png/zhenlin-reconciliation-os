import { Strands } from "./Strands";
import "./zhenlin-logo-stage.css";

type ZhenlinLogoStageProps = {
  className?: string;
};

export function ZhenlinLogoStage({ className = "" }: ZhenlinLogoStageProps) {
  return (
    <div className={`logo-stage ${className}`.trim()}>
      <div className="logo-composition">
        <img className="logo-base" src="/brand/zl-logo-white-glow.png" alt="ZL Logo" />

        <div className="strands-band">
          <Strands
            colors={["#ffffff", "#ffffff", "#ffffff"]}
            count={5}
            speed={0.5}
            amplitude={0.5}
            waviness={1.6}
            thickness={0.8}
            glow={2.6}
            taper={3.2}
            spread={0.7}
            hueShift={0}
            intensity={0.15}
            saturation={2}
            opacity={1}
            scale={1.7}
            endCurl={0.08}
            glass={false}
            refraction={1}
            dispersion={1}
            glassSize={1}
          />
        </div>
      </div>
    </div>
  );
}
