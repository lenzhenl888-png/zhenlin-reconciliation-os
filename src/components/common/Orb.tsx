import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Triangle, Vec3 } from "ogl";

type OrbProps = {
  accentColor?: string;
  backgroundColor?: string;
  baseColor?: string;
  className?: string;
  glowColor?: string;
  hoverIntensity?: number;
  interactive?: boolean;
  rotateOnHover?: boolean;
  speed?: number;
};

const vertexShader = `
  precision highp float;

  attribute vec2 position;
  attribute vec2 uv;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;

  uniform float iTime;
  uniform vec3 iResolution;
  uniform float hover;
  uniform float hoverIntensity;
  uniform float rot;
  uniform vec3 backgroundColor;
  uniform vec3 baseColor;
  uniform vec3 accentColor;
  uniform vec3 glowColor;

  varying vec2 vUv;

  vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
    p3 += dot(p3, p3.yxz + 19.19);
    return -1.0 + 2.0 * fract(vec3(
      p3.x + p3.y,
      p3.x + p3.z,
      p3.y + p3.z
    ) * p3.zyx);
  }

  float snoise3(vec3 p) {
    const float K1 = 0.333333333;
    const float K2 = 0.166666667;
    vec3 i = floor(p + (p.x + p.y + p.z) * K1);
    vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
    vec3 e = step(vec3(0.0), d0 - d0.yzx);
    vec3 i1 = e * (1.0 - e.zxy);
    vec3 i2 = 1.0 - e.zxy * (1.0 - e);
    vec3 d1 = d0 - (i1 - K2);
    vec3 d2 = d0 - (i2 - K1);
    vec3 d3 = d0 - 0.5;
    vec4 h = max(0.6 - vec4(
      dot(d0, d0),
      dot(d1, d1),
      dot(d2, d2),
      dot(d3, d3)
    ), 0.0);
    vec4 n = h * h * h * h * vec4(
      dot(d0, hash33(i)),
      dot(d1, hash33(i + i1)),
      dot(d2, hash33(i + i2)),
      dot(d3, hash33(i + 1.0))
    );
    return dot(vec4(31.316), n);
  }

  float light1(float intensity, float attenuation, float dist) {
    return intensity / (1.0 + dist * attenuation);
  }

  float light2(float intensity, float attenuation, float dist) {
    return intensity / (1.0 + dist * dist * attenuation);
  }

  vec4 extractAlpha(vec3 colorIn) {
    float a = max(max(colorIn.r, colorIn.g), colorIn.b);
    return vec4(colorIn.rgb / (a + 1e-5), a);
  }

  vec4 draw(vec2 uv) {
    const float innerRadius = 0.6;
    const float noiseScale = 0.65;

    float ang = atan(uv.y, uv.x);
    float len = length(uv);
    float invLen = len > 0.0 ? 1.0 / len : 0.0;

    float n0 = snoise3(vec3(uv * noiseScale, iTime * 0.5)) * 0.5 + 0.5;
    float r0 = mix(mix(innerRadius, 1.0, 0.5), mix(innerRadius, 1.0, 0.68), n0);
    float d0 = distance(uv, (r0 * invLen) * uv);
    float v0 = light1(0.82, 18.0, d0);

    v0 *= smoothstep(r0 * 1.025, r0, len);
    float innerFade = smoothstep(r0 * 0.9, r0 * 0.985, len);
    v0 *= innerFade;

    float colorSweep = cos(ang + iTime * 1.8) * 0.5 + 0.5;
    vec3 colBase = mix(baseColor, glowColor, colorSweep);
    colBase = mix(colBase, accentColor, smoothstep(0.18, 0.88, sin(ang - iTime * 0.7) * 0.5 + 0.5) * 0.34);

    float a = iTime * -1.0;
    vec2 pos = vec2(cos(a), sin(a)) * r0;
    float d = distance(uv, pos);
    float v1 = light2(2.15, 4.8, d);
    v1 *= light1(1.12, 64.0, d0);

    float v2 = smoothstep(1.0, mix(innerRadius, 1.0, n0 * 0.5), len);
    float v3 = smoothstep(innerRadius, mix(innerRadius, 1.0, 0.5), len);

    vec3 deepCol = mix(vec3(0.02, 0.07, 0.2), colBase, v0);
    deepCol = (deepCol + v1) * v2 * v3;
    deepCol = clamp(deepCol, 0.0, 1.0);

    vec3 lightCol = (colBase * 1.18 + v1) * mix(1.0, v2 * v3, 0.92);
    lightCol = clamp(lightCol, 0.0, 1.0);

    vec3 finalCol = mix(deepCol, lightCol, smoothstep(0.18, 0.82, v0)) * 1.16;
    return extractAlpha(finalCol);
  }

  void main() {
    vec2 center = iResolution.xy * 0.5;
    float size = min(iResolution.x, iResolution.y);
    vec2 uv = (vUv * iResolution.xy - center) / size * 2.0;

    float s = sin(rot);
    float c = cos(rot);
    uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);

    uv.x += hover * hoverIntensity * 0.1 * sin(uv.y * 10.0 + iTime);
    uv.y += hover * hoverIntensity * 0.1 * sin(uv.x * 10.0 + iTime);

    vec4 col = draw(uv);
    gl_FragColor = vec4(col.rgb * col.a, col.a);
  }
`;

function hexToVec3(color: string) {
  const clean = color.replace("#", "");
  return new Vec3(
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  );
}

export function Orb({
  accentColor = "#8df5c4",
  backgroundColor = "#08111f",
  baseColor = "#3b82f6",
  className = "",
  glowColor = "#6ee7f5",
  hoverIntensity = 0.16,
  interactive = false,
  rotateOnHover = false,
  speed = 1,
}: OrbProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new Renderer({ alpha: true, premultipliedAlpha: false });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    container.appendChild(gl.canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      fragment: fragmentShader,
      uniforms: {
        accentColor: { value: hexToVec3(accentColor) },
        backgroundColor: { value: hexToVec3(backgroundColor) },
        baseColor: { value: hexToVec3(baseColor) },
        glowColor: { value: hexToVec3(glowColor) },
        hover: { value: 0 },
        hoverIntensity: { value: hoverIntensity },
        iResolution: { value: new Vec3(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height) },
        iTime: { value: 0 },
        rot: { value: 0 },
      },
      vertex: vertexShader,
    });
    const mesh = new Mesh(gl, { geometry, program });

    let animationFrame = 0;
    let currentRot = 0;
    let lastTime = 0;
    let targetHover = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.7);
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width * dpr, height * dpr);
      gl.canvas.style.width = `${width}px`;
      gl.canvas.style.height = `${height}px`;
      program.uniforms.iResolution.value.set(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height);
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!interactive) return;
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const size = Math.min(rect.width, rect.height);
      const uvX = ((x - rect.width / 2) / size) * 2;
      const uvY = ((y - rect.height / 2) / size) * 2;
      targetHover = Math.sqrt(uvX * uvX + uvY * uvY) < 0.86 ? 1 : 0;
    };

    const handleMouseLeave = () => {
      targetHover = 0;
    };

    window.addEventListener("resize", resize);
    if (interactive) {
      container.addEventListener("mousemove", handleMouseMove);
      container.addEventListener("mouseleave", handleMouseLeave);
    }
    resize();

    const update = (time: number) => {
      const delta = (time - lastTime) * 0.001;
      lastTime = time;

      program.uniforms.iTime.value = time * 0.001 * speed;
      program.uniforms.hover.value += (targetHover - program.uniforms.hover.value) * 0.08;
      if (rotateOnHover && targetHover > 0.5) {
        currentRot += delta * 0.3;
      }
      program.uniforms.rot.value = currentRot;
      renderer.render({ scene: mesh });
      animationFrame = requestAnimationFrame(update);
    };

    animationFrame = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      if (container.contains(gl.canvas)) {
        container.removeChild(gl.canvas);
      }
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [accentColor, backgroundColor, baseColor, glowColor, hoverIntensity, interactive, rotateOnHover, speed]);

  return <div aria-hidden="true" className={`orb-container ${className}`} ref={containerRef} />;
}
