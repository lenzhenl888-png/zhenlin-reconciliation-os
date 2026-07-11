import { useCallback, useEffect, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";

type Spark = {
  angle: number;
  startTime: number;
  x: number;
  y: number;
};

type ClickSparkProps = {
  children: ReactNode;
  duration?: number;
  easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
  extraScale?: number;
  sparkColor?: string;
  sparkCount?: number;
  sparkRadius?: number;
  sparkSize?: number;
};

export function ClickSpark({
  children,
  duration = 400,
  easing = "ease-out",
  extraScale = 1,
  sparkColor = "#ffffff",
  sparkCount = 8,
  sparkRadius = 15,
  sparkSize = 10,
}: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sparksRef = useRef<Spark[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    let resizeTimeout: ReturnType<typeof window.setTimeout>;

    const resizeCanvas = () => {
      const { width, height } = parent.getBoundingClientRect();
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };

    const handleResize = () => {
      window.clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(resizeCanvas, 100);
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(parent);
    resizeCanvas();

    return () => {
      observer.disconnect();
      window.clearTimeout(resizeTimeout);
    };
  }, []);

  const easeFunc = useCallback(
    (t: number) => {
      switch (easing) {
        case "linear":
          return t;
        case "ease-in":
          return t * t;
        case "ease-in-out":
          return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        case "ease-out":
        default:
          return t * (2 - t);
      }
    },
    [easing],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let animationId = 0;

    const draw = (timestamp: number) => {
      context.clearRect(0, 0, canvas.width, canvas.height);

      sparksRef.current = sparksRef.current.filter((spark) => {
        const elapsed = timestamp - spark.startTime;
        if (elapsed >= duration) return false;

        const progress = elapsed / duration;
        const eased = easeFunc(progress);
        const distance = eased * sparkRadius * extraScale;
        const lineLength = sparkSize * (1 - eased);
        const x1 = spark.x + distance * Math.cos(spark.angle);
        const y1 = spark.y + distance * Math.sin(spark.angle);
        const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle);
        const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle);

        context.strokeStyle = sparkColor;
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();

        return true;
      });

      animationId = window.requestAnimationFrame(draw);
    };

    animationId = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(animationId);
    };
  }, [duration, easeFunc, extraScale, sparkColor, sparkRadius, sparkSize]);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const now = performance.now();

    const newSparks = Array.from({ length: sparkCount }, (_, index) => ({
      angle: (2 * Math.PI * index) / sparkCount,
      startTime: now,
      x,
      y,
    }));

    sparksRef.current.push(...newSparks);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        minHeight: "100vh",
        position: "relative",
        width: "100%",
      }}
    >
      <div style={{ position: "relative", zIndex: 0 }}>{children}</div>
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          height: "100%",
          left: 0,
          pointerEvents: "none",
          position: "absolute",
          top: 0,
          userSelect: "none",
          width: "100%",
          zIndex: 1,
        }}
      />
    </div>
  );
}
