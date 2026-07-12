import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { Color, Mesh, Program, Renderer, Triangle } from "ogl";

const MAX_STRANDS = 4;
const MAX_COLORS = 4;

const vertexShader = `#version 300 es
in vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragmentShader = `#version 300 es
precision highp float;

const float PI = 3.14159265;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColors[${MAX_COLORS}];
uniform int uColorCount;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWaviness;
uniform float uThickness;
uniform float uGlow;
uniform float uSpread;
uniform float uOpacity;
uniform float uScale;

out vec4 fragColor;

vec3 palette(float t) {
  float scaled = fract(t) * float(uColorCount);
  int index = int(floor(scaled));
  int nextIndex = index + 1;
  if (nextIndex >= uColorCount) nextIndex = 0;
  return mix(uColors[index], uColors[nextIndex], fract(scaled));
}

void main() {
  vec2 uv = vec2(
    (gl_FragCoord.x / max(uResolution.x, 1.0) - 0.5) * 2.0,
    (gl_FragCoord.y / max(uResolution.y, 1.0) - 0.5) * 2.0
  );
  float ropeHalfWidth = clamp(0.64 * uScale, 0.68, 0.86);
  float progress = clamp((uv.x + ropeHalfWidth) / (2.0 * ropeHalfWidth), 0.0, 1.0);
  float insideRope = 1.0 - step(ropeHalfWidth, abs(uv.x));
  float pinnedEnds = pow(sin(PI * progress), max(0.4, 1.0 / max(uWaviness, 0.01)));
  float edgeFade = smoothstep(0.0, 0.045, progress) * smoothstep(0.0, 0.045, 1.0 - progress);
  vec3 color = vec3(0.0);

  for (int index = 0; index < ${MAX_STRANDS}; index++) {
    float strand = float(index);
    float turn = uTime * uSpeed * 2.15;
    float bufferedTurn = turn - sin(turn * 2.0) * 0.18;
    float phase = bufferedTurn + strand * PI * 0.5;
    float orbit = sin(phase);
    float separation = cos(phase) * (strand - 1.5) * uSpread * 0.055;
    float ropeFlex = sin(PI * progress * 2.0 + phase) * uAmplitude * 0.12;
    float y = pinnedEnds * (orbit * uAmplitude + separation + ropeFlex);
    float distanceToLine = abs(uv.y - y);
    float thickness = uThickness * (0.45 + pinnedEnds * 0.55);
    float halo = thickness * 1.8 / (distanceToLine + thickness * 0.75);
    float core = thickness / (distanceToLine + thickness * 0.2);
    float line = halo * halo * 0.34 + core * core * 0.85;
    float depthLight = 0.5 + 0.5 * cos(phase);

    color += palette(strand / 4.0) * line * (0.36 + depthLight * 0.82) * edgeFade;
  }

  color = 1.0 - exp(-color * uGlow);
  float alpha = clamp(max(max(color.r, color.g), color.b), 0.0, 1.0) * uOpacity;
  alpha = smoothstep(0.025, 0.11, alpha) * insideRope;
  if (alpha <= 0.001) discard;
  fragColor = vec4(color, alpha);
}`;

type StrandsProps = {
  colors?: string[];
  speed?: number;
  amplitude?: number;
  waviness?: number;
  thickness?: number;
  glow?: number;
  spread?: number;
  opacity?: number;
  scale?: number;
  className?: string;
  style?: CSSProperties;
};

type RuntimeProps = Required<Omit<StrandsProps, "className" | "style">>;

function buildPalette(colors: string[]) {
  const availableColors = colors.length ? colors : ["#ffffff"];
  return Array.from({ length: MAX_COLORS }, (_, index) => {
    const color = new Color(availableColors[index] ?? availableColors[availableColors.length - 1]);
    return [color.r, color.g, color.b];
  });
}

export function Strands({
  colors = ["#1d4ed8", "#3b82f6", "#7dd3fc"],
  speed = 0.3,
  amplitude = 0.18,
  waviness = 1.15,
  thickness = 0.05,
  glow = 2.2,
  spread = 0.48,
  opacity = 1,
  scale = 1.25,
  className = "",
  style,
}: StrandsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef<RuntimeProps>({
    colors,
    speed,
    amplitude,
    waviness,
    thickness,
    glow,
    spread,
    opacity,
    scale,
  });

  propsRef.current = { colors, speed, amplitude, waviness, thickness, glow, spread, opacity, scale };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const renderer = new Renderer({
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.canvas.style.backgroundColor = "transparent";

    const geometry = new Triangle(gl);
    if (geometry.attributes.uv) delete geometry.attributes.uv;

    const initial = propsRef.current;
    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      transparent: false,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [container.offsetWidth, container.offsetHeight] },
        uColors: { value: buildPalette(initial.colors) },
        uColorCount: { value: Math.min(initial.colors.length, MAX_COLORS) },
        uSpeed: { value: initial.speed },
        uAmplitude: { value: initial.amplitude },
        uWaviness: { value: initial.waviness },
        uThickness: { value: initial.thickness },
        uGlow: { value: initial.glow },
        uSpread: { value: initial.spread },
        uOpacity: { value: initial.opacity },
        uScale: { value: initial.scale },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });
    container.appendChild(gl.canvas);

    const resize = () => {
      const { offsetWidth: width, offsetHeight: height } = container;
      if (!width || !height) return;
      renderer.setSize(width, height);
      program.uniforms.uResolution.value = [width, height];
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    let frame = 0;
    const render = (time: number) => {
      frame = requestAnimationFrame(render);
      const current = propsRef.current;
      program.uniforms.uTime.value = time * 0.001;
      program.uniforms.uColors.value = buildPalette(current.colors);
      program.uniforms.uColorCount.value = Math.min(current.colors.length, MAX_COLORS);
      program.uniforms.uSpeed.value = current.speed;
      program.uniforms.uAmplitude.value = current.amplitude;
      program.uniforms.uWaviness.value = current.waviness;
      program.uniforms.uThickness.value = current.thickness;
      program.uniforms.uGlow.value = current.glow;
      program.uniforms.uSpread.value = current.spread;
      program.uniforms.uOpacity.value = current.opacity;
      program.uniforms.uScale.value = current.scale;
      renderer.render({ scene: mesh });
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      gl.canvas.remove();
    };
  }, []);

  return <div ref={containerRef} className={`strands-container ${className}`.trim()} style={style} />;
}
