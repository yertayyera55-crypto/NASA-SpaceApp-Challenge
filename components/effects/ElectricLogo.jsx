'use client';

import { useEffect, useRef } from 'react';
import { Renderer, Program, Mesh, Triangle, Texture } from 'ogl';

import './ElectricLogo.css';

const BOLT = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path d="M39 3 12 37h17l-4 24 27-34H35z" fill="#fff"/></svg>'
)}`;
const RASTER = 256;
const CELL = 4;
const FAR = 1e20;
const ARCS = 5;
const PULSES = 3;
const PIXEL_BUDGET = 4e6;

const hexToRgb = hex => {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.replace(/./g, c => c + c);
  const n = parseInt(h.slice(0, 6), 16);
  return Number.isNaN(n) ? [1, 1, 1] : [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const transformLine = (f, d, v, z, n) => {
  let k = 0;
  v[0] = 0;
  z[0] = -FAR;
  z[1] = FAR;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = FAR;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
};

const transformGrid = (grid, w, h) => {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    transformLine(f, d, v, z, h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    transformLine(f, d, v, z, w);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
};

const buildSdf = (src, size) =>
  new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      const inside = new Float64Array(size * size);
      const outside = new Float64Array(size * size);
      for (let i = 0; i < size * size; i++) {
        const a = data[i * 4 + 3] / 255;
        inside[i] = a < 0.5 ? FAR : 0;
        outside[i] = a >= 0.5 ? FAR : 0;
      }
      transformGrid(inside, size, size);
      transformGrid(outside, size, size);
      const sdf = new Float32Array(size * size);
      for (let i = 0; i < size * size; i++)
        sdf[i] = (Math.sqrt(outside[i]) - Math.sqrt(inside[i])) / size;
      resolve(sdf);
    };
    img.onerror = () => {
      const sdf = new Float32Array(size * size).fill(0.5);
      resolve(sdf);
    };
    img.src = src;
  });

const vert = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const buildFrag = (strands, theme) => `
precision highp float;
uniform sampler2D uSdf;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uGlowColor;
uniform float uScale;
uniform float uIntensity;
uniform float uGlow;
uniform float uThickness;
uniform float uBend;
uniform float uCrackle;
uniform float uFlicker;
uniform float uFill;
uniform float uSpeed;
uniform float uArcs[${ARCS * 4}];
uniform float uPulses[${PULSES * 3}];
uniform vec2 uCursor;
uniform float uCursorCharge;
uniform float uCursorRadius;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1,0)), f.x),
    mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; }
  return v;
}

float sdfVal(vec2 uv) {
  return texture2D(uSdf, uv).r - 0.5;
}

vec2 sdfGrad(vec2 uv) {
  float eps = 1.0 / ${RASTER}.0;
  return vec2(
    sdfVal(uv + vec2(eps, 0.0)) - sdfVal(uv - vec2(eps, 0.0)),
    sdfVal(uv + vec2(0.0, eps)) - sdfVal(uv - vec2(0.0, eps))
  ) / (2.0 * eps);
}

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  vec2 center = vec2(0.5);
  vec2 p = (uv - center) / uScale;
  p.x *= aspect;
  p += center;

  float d = sdfVal(p);
  vec2 grad = normalize(sdfGrad(p) + vec2(1e-6));
  float t = uTime * uSpeed;

  float brightness = 0.0;
  float fillAmt = 0.0;

  // cursor charge
  vec2 cursorUv = uCursor / uRes;
  cursorUv.y = 1.0 - cursorUv.y;
  float cursorDist = length(uv - cursorUv) * max(uRes.x, uRes.y);
  float cursorFactor = uCursorCharge * max(0.0, 1.0 - cursorDist / uCursorRadius);

  // strands
  for (int s = 0; s < ${strands}; s++) {
    float phase = float(s) * 6.2832 / float(${strands});
    float offset = float(s) * 0.37;
    float strandT = t + phase;
    vec2 perp = vec2(-grad.y, grad.x);
    float bendAmt = uBend * (0.5 + 0.5 * sin(strandT * 0.7 + offset));
    vec2 displaced = p + perp * bendAmt * 0.08;
    float sd = sdfVal(displaced);
    float crackleNoise = fbm(displaced * 12.0 + vec2(strandT * 0.3, offset)) * uCrackle;
    float thickness = uThickness * (0.5 + 0.5 / float(s + 1)) * 0.003;
    float strandBrightness = exp(-abs(sd - crackleNoise * 0.01) / thickness);
    float flicker = 1.0 + uFlicker * (noise(vec2(strandT * 2.1, float(s))) - 0.5);
    brightness += strandBrightness * flicker * (1.0 - 0.15 * float(s));
    if (s == 0) brightness += strandBrightness * cursorFactor * 2.0;
  }

  // fill
  if (d < 0.0) {
    fillAmt = uFill * (1.0 - smoothstep(-0.15, 0.0, d));
  }

  // arcs
  for (int a = 0; a < ${ARCS}; a++) {
    float aStart = uArcs[a * 4];
    float aEnd = uArcs[a * 4 + 1];
    float aLife = uArcs[a * 4 + 2];
    float aPhase = uArcs[a * 4 + 3];
    if (aLife <= 0.0) continue;
    float arcT = aPhase;
    vec2 perp2 = vec2(-grad.y, grad.x);
    float sd2 = sdfVal(p + perp2 * 0.02);
    float arcNoise = fbm(p * 8.0 + vec2(arcT)) * uCrackle * 0.5;
    float arcBrightness = exp(-abs(sd2 - arcNoise * 0.008) / 0.004) * aLife;
    brightness += arcBrightness * 0.6;
  }

  // pulses
  for (int i = 0; i < ${PULSES}; i++) {
    float pPos = uPulses[i * 3];
    float pLife = uPulses[i * 3 + 1];
    float pRadius = uPulses[i * 3 + 2];
    if (pLife <= 0.0) continue;
    float dist = length(uv - vec2(pPos, 0.5));
    float pulse = exp(-abs(dist - pRadius) / 0.015) * pLife;
    brightness += pulse * 0.5;
  }

  brightness *= uIntensity * uGlow;

  // glow halo around shape
  float halo = exp(-abs(d) / (0.04 * uGlow));
  brightness += halo * 0.3 * uIntensity;

  vec3 col = uColor * brightness + uGlowColor * fillAmt;
  col += uGlowColor * halo * 0.15;

  ${theme === 'light'
    ? 'col = mix(vec3(1.0), col, brightness + fillAmt + halo * 0.3); gl_FragColor = vec4(1.0 - col, brightness + fillAmt);'
    : 'gl_FragColor = vec4(col, clamp(brightness + fillAmt + halo * 0.15, 0.0, 1.0));'
  }
}`;

export default function ElectricLogo({
  src = BOLT,
  color = '#ecc7ff',
  glowColor = '#ad6dff',
  scale = 0.7,
  intensity = 1,
  glow = 1,
  thickness = 1.5,
  strands = 4,
  bend = 0.6,
  crackle = 1.5,
  arcs = 1,
  flicker = 0.6,
  fill = 0,
  speed = 2.5,
  interactive = true,
  cursorIntensity = 0.75,
  cursorRadius = 100,
  theme = 'dark',
  onRender,
  className = '',
  style,
}) {
  const containerRef = useRef(null);
  const stateRef = useRef({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const strandCount = Math.max(1, Math.min(6, strands));
    const renderer = new Renderer({ alpha: true, premultipliedAlpha: false, antialias: false });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    container.appendChild(gl.canvas);

    const sdfSize = Math.min(RASTER, Math.floor(Math.sqrt(PIXEL_BUDGET)));
    const geometry = new Triangle(gl);

    let program = null;
    let mesh = null;
    let rafId = null;
    let destroyed = false;

    const arcState = Array.from({ length: ARCS }, () => ({ start: 0, end: 0, life: 0, phase: 0 }));
    const pulseState = Array.from({ length: PULSES }, () => ({ pos: 0, life: 0, radius: 0 }));
    const cursorPos = { x: -9999, y: -9999 };
    let cursorCharge = 0;

    const flatArcs = () => arcState.flatMap(a => [a.start, a.end, a.life, a.phase]);
    const flatPulses = () => pulseState.flatMap(p => [p.pos, p.life, p.radius]);

    const spawnArc = () => {
      const slot = arcState.find(a => a.life <= 0);
      if (!slot) return;
      slot.start = Math.random();
      slot.end = slot.start + (Math.random() * 0.3 + 0.05) * (Math.random() < 0.5 ? 1 : -1);
      slot.life = 1;
      slot.phase = Math.random() * 100;
    };

    const spawnPulse = (x, y) => {
      const slot = pulseState.find(p => p.life <= 0);
      if (!slot) return;
      slot.pos = x;
      slot.life = 1;
      slot.radius = 0;
    };

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      renderer.setSize(width, height);
      if (program) {
        program.uniforms.uRes.value = [width, height];
      }
    };

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const onMove = e => {
      if (!interactive) return;
      const rect = container.getBoundingClientRect();
      cursorPos.x = e.clientX - rect.left;
      cursorPos.y = e.clientY - rect.top;
      cursorCharge = cursorIntensity;
    };
    const onLeave = () => { cursorCharge = 0; };
    const onClick = e => {
      if (!interactive) return;
      const rect = container.getBoundingClientRect();
      spawnPulse((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
      for (let i = 0; i < 3; i++) spawnArc();
    };

    if (interactive) {
      container.addEventListener('mousemove', onMove);
      container.addEventListener('mouseleave', onLeave);
      container.addEventListener('click', onClick);
    }

    buildSdf(src || BOLT, sdfSize).then(sdfData => {
      if (destroyed) return;

      const texture = new Texture(gl, {
        image: sdfData,
        width: sdfSize,
        height: sdfSize,
        internalFormat: gl.R32F,
        format: gl.RED,
        type: gl.FLOAT,
        minFilter: gl.LINEAR,
        magFilter: gl.LINEAR,
        generateMipmaps: false,
      });

      const { width, height } = container.getBoundingClientRect();

      program = new Program(gl, {
        vertex: vert,
        fragment: buildFrag(strandCount, theme),
        uniforms: {
          uSdf: { value: texture },
          uRes: { value: [width, height] },
          uTime: { value: 0 },
          uColor: { value: hexToRgb(color) },
          uGlowColor: { value: hexToRgb(glowColor) },
          uScale: { value: scale },
          uIntensity: { value: intensity },
          uGlow: { value: glow },
          uThickness: { value: thickness },
          uBend: { value: bend },
          uCrackle: { value: crackle },
          uFlicker: { value: flicker },
          uFill: { value: fill },
          uSpeed: { value: speed },
          uArcs: { value: flatArcs() },
          uPulses: { value: flatPulses() },
          uCursor: { value: [cursorPos.x, cursorPos.y] },
          uCursorCharge: { value: 0 },
          uCursorRadius: { value: cursorRadius },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });

      mesh = new Mesh(gl, { geometry, program });

      let lastTime = performance.now();
      let arcTimer = 0;
      const arcInterval = arcs > 0 ? 1 / (arcs * 2 + 0.5) : 999;

      const render = now => {
        if (destroyed) return;
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        program.uniforms.uTime.value += dt;
        arcTimer += dt;
        if (arcTimer > arcInterval && arcs > 0) {
          arcTimer = 0;
          spawnArc();
        }

        arcState.forEach(a => { if (a.life > 0) a.life = Math.max(0, a.life - dt * 2.5); });
        pulseState.forEach(p => { if (p.life > 0) { p.life = Math.max(0, p.life - dt * 1.5); p.radius += dt * 0.4; } });

        program.uniforms.uArcs.value = flatArcs();
        program.uniforms.uPulses.value = flatPulses();
        program.uniforms.uCursor.value = [cursorPos.x, cursorPos.y];
        program.uniforms.uCursorCharge.value = cursorCharge;

        renderer.render({ scene: mesh });
        if (onRender) onRender(gl.canvas);
        rafId = requestAnimationFrame(render);
      };

      rafId = requestAnimationFrame(render);
    });

    return () => {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      if (interactive) {
        container.removeEventListener('mousemove', onMove);
        container.removeEventListener('mouseleave', onLeave);
        container.removeEventListener('click', onClick);
      }
      if (gl.canvas.parentNode) gl.canvas.parentNode.removeChild(gl.canvas);
      renderer.gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [src, color, glowColor, scale, intensity, glow, thickness, strands, bend, crackle, arcs, flicker, fill, speed, interactive, cursorIntensity, cursorRadius, theme, onRender]);

  return (
    <div
      ref={containerRef}
      className={`electric-logo${className ? ` ${className}` : ''}`}
      style={style}
    />
  );
}
