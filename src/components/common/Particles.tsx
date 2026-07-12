import { useEffect, useRef } from "react";

type Particle = {
  color: string;
  depth: number;
  drift: number;
  offset: number;
  size: number;
  x: number;
  y: number;
};

type ParticlesProps = {
  alphaParticles?: boolean;
  className?: string;
  disableRotation?: boolean;
  moveParticlesOnHover?: boolean;
  particleBaseSize?: number;
  particleColors?: string[];
  particleCount?: number;
  particleHoverFactor?: number;
  particleSpread?: number;
  pixelRatio?: number;
  speed?: number;
};

export function Particles({
  alphaParticles = false,
  className = "",
  disableRotation = false,
  moveParticlesOnHover = false,
  particleBaseSize = 100,
  particleColors = ["#ffffff"],
  particleCount = 200,
  particleHoverFactor = 1,
  particleSpread = 10,
  pixelRatio = 1,
  speed = 0.1,
}: ParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ active: false, x: 0, y: 0 });
  const particleColorsKey = particleColors.join("|");

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    const interactionTarget = container?.parentElement ?? container;
    const context = canvas?.getContext("2d");
    if (!canvas || !container || !interactionTarget || !context) return;

    let animationId = 0;
    const palette = particleColors.length > 0 ? particleColors : ["#ffffff"];

    const createParticles = () => {
      const rect = container.getBoundingClientRect();
      const baseSize = Math.max(1.2, particleBaseSize / 34);
      const margin = Math.max(48, particleSpread * 3);

      particlesRef.current = Array.from({ length: particleCount }, (_, index) => ({
        color: palette[index % palette.length],
        depth: 0.35 + Math.random() * 0.9,
        drift: 0.35 + Math.random() * 0.85,
        offset: Math.random() * Math.PI * 2,
        size: baseSize * (0.5 + Math.random() * 0.9),
        x: -margin + Math.random() * (rect.width + margin * 2),
        y: -margin + Math.random() * (rect.height + margin * 2),
      }));
    };

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, pixelRatio);
      const nextWidth = Math.max(1, Math.floor(rect.width * ratio));
      const nextHeight = Math.max(1, Math.floor(rect.height * ratio));
      const shouldCreateParticles = canvas.width !== nextWidth || canvas.height !== nextHeight || particlesRef.current.length === 0;

      if (canvas.width !== nextWidth) {
        canvas.width = nextWidth;
      }
      if (canvas.height !== nextHeight) {
        canvas.height = nextHeight;
      }
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      if (shouldCreateParticles) {
        createParticles();
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current = {
        active: true,
        x: (event.clientX - rect.left) / rect.width - 0.5,
        y: (event.clientY - rect.top) / rect.height - 0.5,
      };
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(container);
    resizeCanvas();

    if (moveParticlesOnHover) {
      interactionTarget.addEventListener("mousemove", handleMouseMove);
      interactionTarget.addEventListener("mouseleave", handleMouseLeave);
    }

    const draw = (time: number) => {
      const rect = container.getBoundingClientRect();
      context.clearRect(0, 0, rect.width, rect.height);

      const hoverX = moveParticlesOnHover && mouseRef.current.active ? mouseRef.current.x * particleSpread * particleHoverFactor : 0;
      const hoverY = moveParticlesOnHover && mouseRef.current.active ? mouseRef.current.y * particleSpread * particleHoverFactor : 0;
      const rotation = disableRotation ? 0 : time * 0.001 * speed;

      for (const particle of particlesRef.current) {
        const driftTime = time * 0.00035 * speed * particle.drift;
        const waveX = Math.sin(driftTime + particle.offset) * particleSpread * particle.depth;
        const waveY = Math.cos(driftTime * 0.8 + particle.offset) * particleSpread * particle.depth;
        const orbit = particleSpread * (0.45 + particle.depth * 0.8);
        const orbitAngle = rotation * particle.drift + particle.offset;
        const orbitX = disableRotation ? 0 : Math.cos(orbitAngle) * orbit;
        const orbitY = disableRotation ? 0 : Math.sin(orbitAngle) * orbit * 1.35;
        const x = particle.x + orbitX + waveX - hoverX * particle.depth;
        const y = particle.y + orbitY + waveY - hoverY * particle.depth;
        const alpha = alphaParticles ? 0.24 * particle.depth : 0.46 * particle.depth;

        context.beginPath();
        context.fillStyle = particle.color;
        context.globalAlpha = alpha;
        context.arc(x, y, particle.size * particle.depth, 0, Math.PI * 2);
        context.fill();
      }

      context.globalAlpha = 1;
      animationId = window.requestAnimationFrame(draw);
    };

    animationId = window.requestAnimationFrame(draw);

    return () => {
      observer.disconnect();
      interactionTarget.removeEventListener("mousemove", handleMouseMove);
      interactionTarget.removeEventListener("mouseleave", handleMouseLeave);
      window.cancelAnimationFrame(animationId);
    };
  }, [
    alphaParticles,
    disableRotation,
    moveParticlesOnHover,
    particleBaseSize,
    particleColorsKey,
    particleCount,
    particleHoverFactor,
    particleSpread,
    pixelRatio,
    speed,
  ]);

  return (
    <div className={`particles-container ${className}`}>
      <canvas ref={canvasRef} />
    </div>
  );
}
