import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import { Color, Mesh, Program, Renderer, RenderTarget, Triangle } from "ogl";

const MAX_STRANDS = 12;
const MAX_COLORS = 8;

const vertexShader = `#version 300 es
in vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragmentShader = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColors[${MAX_COLORS}];
uniform int uColorCount;
uniform int uStrandCount;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWaviness;
uniform float uThickness;
uniform float uGlow;
uniform float uTaper;
uniform float uSpread;
uniform float uHueShift;
uniform float uIntensity;
uniform float uOpacity;
uniform float uScale;
uniform float uSaturation;
uniform float uEndCurl;

out vec4 fragColor;

const float PI = 3.14159265;

vec3 spectrum(float t) {
  return 0.5 + 0.5 * cos(2.0 * PI * (t + vec3(0.00, 0.33, 0.67)));
}

vec3 samplePalette(float t) {
  t = fract(t);
  float scaled = t * float(uColorCount);
  int index = int(floor(scaled));
  float blend = fract(scaled);
  int nextIndex = index + 1;
  if (nextIndex >= uColorCount) nextIndex = 0;
  return mix(uColors[index], uColors[nextIndex], blend);
}

vec3 strandColor(float t) {
  if (uColorCount > 0) return samplePalette(t);
  return spectrum(t);
}

void main() {
  vec2 uv = vec2(
    (gl_FragCoord.x / max(uResolution.x, 1.0) - 0.5) * 2.0,
    (gl_FragCoord.y / max(uResolution.y, 1.0) - 0.5) * 2.0
  );
  float rawX = uv.x;
  uv.x /= max(uScale, 0.0001);

  float energy = 0.06 + uIntensity * 0.94;
  float envelope = pow(max(cos(uv.x * PI * 0.76), 0.0), uTaper);
  vec3 color = vec3(0.0);

  for (int index = 0; index < ${MAX_STRANDS}; index++) {
    if (index >= uStrandCount) break;

    float strand = float(index);
    float phase = strand * 1.7 * uSpread;
    float frequency = (2.0 + strand * 0.35) * uWaviness;
    float speed = 1.4 + strand * 1.2;
    float time = uTime * uSpeed;

    float wave =
      sin(uv.x * frequency + time * speed + phase) * 0.60 +
      sin(uv.x * frequency * 1.1 - time * speed * 0.7 + phase * 1.7) * 0.40;

    float amplitude = (0.52 + 0.08 * energy) * envelope * uAmplitude;
    float endCurl = sign(rawX) * pow(abs(rawX), 1.65) * uEndCurl;
    float y = wave * amplitude + endCurl;

    float distanceToLine = abs(uv.y - y);
    float thickness = (0.016 + 0.12 * energy) * (0.35 + envelope) * uThickness;
    float glow = thickness / (distanceToLine + thickness * 0.45);
    glow = glow * glow;

    float hue = strand / float(uStrandCount) + uv.x * 0.30 + uTime * 0.04 + uHueShift;
    color += strandColor(hue) * glow * envelope;
  }

  color *= 0.45 + 0.7 * energy;
  color = 1.0 - exp(-color * uGlow);

  float gray = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = max(mix(vec3(gray), color, uSaturation), 0.0);

  float luminance = max(max(color.r, color.g), color.b);
  float alpha = clamp(luminance, 0.0, 1.0) * uOpacity;

  fragColor = vec4(color * uOpacity, alpha);
}`;

const glassFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D uScene;
uniform vec2 uResolution;
uniform float uRadius;
uniform float uRefraction;
uniform float uDispersion;

out vec4 fragColor;

vec2 toUv(vec2 point) {
  return point * (uResolution.y / uResolution) + 0.5;
}

void main() {
  vec2 point = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float distanceFromCenter = length(point);
  float radius = uRadius;
  float edge = fwidth(distanceFromCenter) * 1.5;
  float mask = 1.0 - smoothstep(radius - edge, radius + edge, distanceFromCenter);
  if (mask <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  float z = sqrt(max(radius * radius - distanceFromCenter * distanceFromCenter, 0.0)) / radius;
  float normalizedDistance = distanceFromCenter / radius;
  vec2 direction = distanceFromCenter > 0.0 ? point / distanceFromCenter : vec2(0.0);
  float lens = smoothstep(0.85, 1.0, normalizedDistance) * pow(normalizedDistance, 6.0);
  vec2 offset = -direction * lens * uRefraction * 0.15;
  vec2 dispersion = -direction * lens * uDispersion * 0.012;
  vec3 light;
  light.r = texture(uScene, toUv(point + offset - dispersion)).r;
  light.g = texture(uScene, toUv(point + offset)).g;
  light.b = texture(uScene, toUv(point + offset + dispersion)).b;
  float fresnel = pow(1.0 - z, 3.0);
  vec3 rim = vec3(1.0) * fresnel * 0.18;
  vec2 lightDirection = normalize(vec2(-0.55, 0.6));
  float specular = pow(max(dot(point / max(radius, 1e-4), lightDirection), 0.0), 6.0);
  specular *= smoothstep(radius, radius * 0.55, distanceFromCenter);
  vec3 emissive = light + rim + vec3(specular) * 0.4;
  float emissiveAlpha = clamp(max(max(emissive.r, emissive.g), emissive.b), 0.0, 1.0);
  float bodyAlpha = 0.05 + fresnel * 0.05;
  float outputAlpha = emissiveAlpha + bodyAlpha * (1.0 - emissiveAlpha);
  vec3 outputColor = emissive;
  outputColor *= mask;
  outputAlpha *= mask;
  fragColor = vec4(outputColor, outputAlpha);
}`;

type StrandsProps = {
  className?: string;
  colors?: string[];
  count?: number;
  speed?: number;
  amplitude?: number;
  waviness?: number;
  thickness?: number;
  glow?: number;
  taper?: number;
  spread?: number;
  hueShift?: number;
  intensity?: number;
  saturation?: number;
  opacity?: number;
  scale?: number;
  glass?: boolean;
  refraction?: number;
  dispersion?: number;
  glassSize?: number;
  endCurl?: number;
  style?: CSSProperties;
};

type RuntimeProps = Required<Omit<StrandsProps, "className" | "style">>;

function buildPalette(colors: string[]) {
  const filled = colors.length ? colors : ["#ffffff"];
  return Array.from({ length: MAX_COLORS }, (_, index) => {
    const color = new Color(filled[index] ?? filled[filled.length - 1]);
    return [color.r, color.g, color.b];
  });
}

function clampCount(count: number) {
  return Math.min(Math.max(Math.round(count), 1), MAX_STRANDS);
}

export function Strands({
  className = "",
  colors = ["#d8fff0", "#55f0c2", "#0ea5e9"],
  count = 4,
  speed = 0.35,
  amplitude = 0.42,
  waviness = 0.92,
  thickness = 0.45,
  glow = 1.65,
  taper = 3,
  spread = 0.7,
  hueShift = 0,
  intensity = 0.45,
  saturation = 1.2,
  opacity = 0.88,
  scale = 1.7,
  glass = false,
  refraction = 1,
  dispersion = 1,
  glassSize = 1,
  endCurl = 0.08,
  style,
}: StrandsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const paletteKey = colors.join("|");
  const palette = useMemo(() => buildPalette(colors), [paletteKey]);
  const propsRef = useRef<RuntimeProps>({
    colors,
    count,
    speed,
    amplitude,
    waviness,
    thickness,
    glow,
    taper,
    spread,
    hueShift,
    intensity,
    saturation,
    opacity,
    scale,
    glass,
    refraction,
    dispersion,
    glassSize,
    endCurl,
  });

  propsRef.current = {
    colors,
    count,
    speed,
    amplitude,
    waviness,
    thickness,
    glow,
    taper,
    spread,
    hueShift,
    intensity,
    saturation,
    opacity,
    scale,
    glass,
    refraction,
    dispersion,
    glassSize,
    endCurl,
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const renderer = new Renderer({
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      dpr: Math.min(Math.max(window.devicePixelRatio || 1, 2), 3),
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.canvas.style.backgroundColor = "transparent";

    const geometry = new Triangle(gl);
    if (geometry.attributes.uv) {
      delete geometry.attributes.uv;
    }

    const initial = propsRef.current;
    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [container.offsetWidth, container.offsetHeight] },
        uColors: { value: palette },
        uColorCount: { value: Math.min(initial.colors.length, MAX_COLORS) },
        uStrandCount: { value: clampCount(initial.count) },
        uSpeed: { value: initial.speed },
        uAmplitude: { value: initial.amplitude },
        uWaviness: { value: initial.waviness },
        uThickness: { value: initial.thickness },
        uGlow: { value: initial.glow },
        uTaper: { value: initial.taper },
        uSpread: { value: initial.spread },
        uHueShift: { value: initial.hueShift },
        uIntensity: { value: initial.intensity },
        uOpacity: { value: initial.opacity },
        uScale: { value: initial.scale },
        uSaturation: { value: initial.saturation },
        uEndCurl: { value: initial.endCurl },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });

    const renderTarget = new RenderTarget(gl, {
      width: container.offsetWidth,
      height: container.offsetHeight,
    });
    const glassProgram = new Program(gl, {
      vertex: vertexShader,
      fragment: glassFragmentShader,
      uniforms: {
        uScene: { value: renderTarget.texture },
        uResolution: { value: [container.offsetWidth, container.offsetHeight] },
        uRadius: { value: 0.46 * initial.glassSize },
        uRefraction: { value: initial.refraction },
        uDispersion: { value: initial.dispersion },
      },
    });
    const glassMesh = new Mesh(gl, { geometry, program: glassProgram });

    container.appendChild(gl.canvas);

    const resize = () => {
      const width = container.offsetWidth;
      const height = container.offsetHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      program.uniforms.uResolution.value = [width, height];
      renderTarget.setSize(width, height);
      glassProgram.uniforms.uResolution.value = [width, height];
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    let animationFrameId = 0;
    let running = false;

    const update = (time: number) => {
      if (!running) return;
      animationFrameId = requestAnimationFrame(update);
      const current = propsRef.current;
      program.uniforms.uTime.value = time * 0.001;
      program.uniforms.uColors.value = palette;
      program.uniforms.uColorCount.value = Math.min(current.colors.length, MAX_COLORS);
      program.uniforms.uStrandCount.value = clampCount(current.count);
      program.uniforms.uSpeed.value = current.speed;
      program.uniforms.uAmplitude.value = current.amplitude;
      program.uniforms.uWaviness.value = current.waviness;
      program.uniforms.uThickness.value = current.thickness;
      program.uniforms.uGlow.value = current.glow;
      program.uniforms.uTaper.value = current.taper;
      program.uniforms.uSpread.value = current.spread;
      program.uniforms.uHueShift.value = current.hueShift;
      program.uniforms.uIntensity.value = current.intensity;
      program.uniforms.uOpacity.value = current.opacity;
      program.uniforms.uScale.value = current.scale;
      program.uniforms.uSaturation.value = current.saturation;
      program.uniforms.uEndCurl.value = current.endCurl;

      if (current.glass) {
        renderer.render({ scene: mesh, target: renderTarget });
        glassProgram.uniforms.uScene.value = renderTarget.texture;
        glassProgram.uniforms.uRefraction.value = current.refraction;
        glassProgram.uniforms.uDispersion.value = current.dispersion;
        glassProgram.uniforms.uRadius.value = 0.46 * current.glassSize;
        renderer.render({ scene: glassMesh });
      } else {
        renderer.render({ scene: mesh });
      }
    };

    const start = () => {
      if (running || document.hidden) return;
      running = true;
      animationFrameId = requestAnimationFrame(update);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(animationFrameId);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    start();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      resizeObserver.disconnect();
      if (gl.canvas.parentNode === container) {
        container.removeChild(gl.canvas);
      }
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [palette]);

  return <div ref={containerRef} className={`strands-container ${className}`.trim()} style={style} />;
}
