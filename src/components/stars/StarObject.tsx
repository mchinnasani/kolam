'use client';

import { optimizedAnimation, registerLayer, reportLayer } from '../animation/performance';
import { useEffect, useRef, useState } from 'react';

export type StarKind = 'name' | 'about' | 'projects' | 'interests';
export type FlightOrigin = { x: number; y: number; radius: number };
const colours: Record<StarKind, [number, number, number]> = {
  name: [.78, .88, 1], about: [.3, .82, 1], projects: [1, .66, .23], interests: [.69, .4, 1],
};
const vertex = `
precision mediump float;
attribute vec3 a_position;
attribute float a_seed;
uniform vec2 u_view;
uniform vec2 u_center;
uniform float u_radius;
uniform float u_time;
uniform float u_kind;
uniform float u_hover;
uniform float u_flight;
uniform float u_dpr;
varying float v_light;
varying float v_seed;
varying vec2 v_direction;
void main() {
  vec3 p = a_position;
  if(u_kind > .5) {
    float angle = u_time * .035;
    p.xz = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p.xz;
    p.xy = mat2(.98, -.199, .199, .98) * p.xy;
    if(a_seed > .94) {
      float orbit = u_time * (.045 + a_seed * .025);
      p.xy = mat2(cos(orbit), -sin(orbit), sin(orbit), cos(orbit)) * p.xy;
      float shooting = smoothstep(.92, 1., fract(u_time * .065 + a_seed * 17.));
      if(a_seed > .992) p.xy *= 1. + shooting * .35;
    }
  }
  float depth = u_kind > .5 ? 2.7 / (2.7 - p.z) : 1.;
  vec2 position = u_center + p.xy * u_radius * depth;
  gl_Position = vec4(position / u_view * 2. - 1., 0., 1.);
  float twinkle = .77 + .23 * sin(u_time * (.6 + a_seed * 1.8) + a_seed * 123.);
  float facing = u_kind > .5 ? .08 + .92 * pow(clamp((p.z + 1.) * .5, 0., 1.), 1.6) : 1.;
  v_light = facing * twinkle * (.4 + a_seed * .6) * (1. + u_hover * .5) * (u_kind < .5 ? 1.7 : 1.5);
  v_seed = a_seed;
  v_direction = normalize(position - u_view * .5 + vec2(.01));
  gl_PointSize = (u_kind < .5 ? 2.5 : 1.8 + a_seed * 1.8) * u_dpr * depth * (1. + u_hover * .18 + u_flight * 7.);
}`;
const fragment = `
precision mediump float;
uniform vec3 u_colour;
uniform float u_flight;
varying float v_light;
varying float v_seed;
varying vec2 v_direction;
void main() {
  vec2 p = gl_PointCoord - .5;
  float along = dot(p, v_direction);
  float across = dot(p, vec2(-v_direction.y, v_direction.x));
  float r = length(vec2(along / (1. + u_flight * 3.), across * (1. + u_flight * 2.)));
  float glow = exp(-r*r*22.);
  float core = exp(-r*r*150.);
  vec3 colour = mix(u_colour, vec3(1.), core * .8);
  float alpha = (glow * .85 + core * .7) * v_light;
  gl_FragColor = vec4(colour * alpha, alpha);
}`;

function points(kind: StarKind, text: string) {
  const result: number[] = [];
  let seed = 74;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  if (kind === 'name') {
    const mask = document.createElement('canvas'); mask.width = 1200; mask.height = 110;
    const ctx = mask.getContext('2d');
    if (!ctx) return new Float32Array();
    ctx.font = '500 83px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const measured = ctx.measureText(text).width;
    if (measured > 1000) ctx.font = `500 ${83 * 1000 / measured}px Arial`;
    ctx.fillText(text, 600, 55);
    const data = ctx.getImageData(0, 0, 1200, 110).data;
    for (let y = 0; y < 110; y += 3) for (let x = 0; x < 1200; x += 3) {
      if (data[(y * 1200 + x) * 4 + 3] > 100) result.push((x - 600) / 450, (55 - y) / 450, 0, random());
    }
  } else {
    for (let i = 0; i < 3400; i++) {
      const y = 1 - 2 * random(); const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(1 - y * y); const shell = .85 + random() * .15;
      result.push(Math.cos(angle) * radius * shell, y * shell, Math.sin(angle) * radius * shell, random() * .94);
    }
    for (let i = 0; i < 260; i++) {
      const a = random() * Math.PI * 2, r = 1.18 + random() * .4;
      result.push(Math.cos(a) * r, Math.sin(a) * r * .42, Math.sin(a) * .4, .94 + random() * .06);
    }
  }
  return new Float32Array(result);
}

/** One buffered point draw per object. Motion and twinkle run in the vertex shader. */
export default function StarObject({ kind, active = false, origin, onFinish, text = "Your Universe" }: {
  kind: StarKind; active?: boolean; origin?: FlightOrigin; onFinish?: () => void; text?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hover = useRef(active);
  const [ready, setReady] = useState(false);
  useEffect(() => { hover.current = active; }, [active]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true });
    if (!gl) { onFinish?.(); return; }
    const optimized = optimizedAnimation();
    const stats = registerLayer(kind);
    const stage = canvas.closest<HTMLElement>('.kolam-stage');
    const main = canvas.closest('main');
    const shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let frame = 0;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Star shader allocation failed');
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Star shader failed');
      return shader;
    };
    let stop = false, inView = true, brightness = 0, painted = false;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const start = performance.now();
    let w = 1, h = 1, dpr = 1;
    try {
      program = gl.createProgram(); if (!program) throw new Error('Star program allocation failed');
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Star program link failed');
      // oxlint-disable-next-line react/react-compiler -- WebGL useProgram is not a React hook.
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const data = points(kind, text); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'a_position'), seed = gl.getAttribLocation(program, 'a_seed');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(seed); gl.vertexAttribPointer(seed, 1, gl.FLOAT, false, 16, 12);
      const uniforms = Object.fromEntries(['view','center','radius','time','kind','hover','flight','dpr','colour'].map(key => [key, gl.getUniformLocation(program!, `u_${key}`)]));
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform3fv(uniforms.colour, colours[kind]); gl.uniform1f(uniforms.kind, kind === 'name' ? 0 : 1);
      const resize = () => {
        const rect = canvas.getBoundingClientRect(); w = rect.width; h = rect.height;
        dpr = Math.min(devicePixelRatio, 2); canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
      };
      resize();
      const paint = (now: number) => {
        frame = 0; if (stop || document.hidden || !inView) return;
        if (optimized && (main?.inert || (kind === 'name' && stage && !stage.hasAttribute('data-revealed') && !motion.matches && !stage.closest('[data-failed]')))) return;
        const began = performance.now();
        if (origin && motion.matches) { onFinish?.(); return; }
        const elapsed = (now - start) / 1000;
        const t = origin ? Math.min(1, elapsed / 2.6) : 0;
        const ease = t * t * (3 - 2 * t);
        brightness += ((hover.current ? 1 : 0) - brightness) * .06;
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uniforms.view, w, h);
        gl.uniform2f(uniforms.center, origin ? origin.x + (w / 2 - origin.x) * ease : w / 2, origin ? h - (origin.y + (h / 2 - origin.y) * ease) : h / 2);
        gl.uniform1f(uniforms.radius, origin ? origin.radius * Math.exp(ease * Math.log(Math.max(w,h) * 2.5 / origin.radius)) : kind === 'name' ? w * .48 : Math.min(w,h) * .32);
        gl.uniform1f(uniforms.time, motion.matches ? 0 : now / 1000);
        gl.uniform1f(uniforms.hover, brightness);
        gl.uniform1f(uniforms.flight, Math.sin(t * Math.PI));
        gl.uniform1f(uniforms.dpr, dpr);
        gl.drawArrays(gl.POINTS, 0, data.length / 4);
        reportLayer(stats,began,1,data.length/4,dpr);
        if (!painted) { painted = true; setReady(true); }
        if (origin && t >= 1) { onFinish?.(); return; }
        if (!motion.matches || origin) frame = requestAnimationFrame(paint);
      };
      const queue = () => { if (!frame && !stop && !document.hidden && inView) frame = requestAnimationFrame(paint); };
      if (optimized) stage?.addEventListener('journeyframe',queue);
      const inertObserver = new MutationObserver(queue);
      if (optimized && main) inertObserver.observe(main,{attributes:true,attributeFilter:['inert']});
      const observer = new ResizeObserver(() => { resize(); queue(); }); observer.observe(canvas);
      const visibility = new IntersectionObserver(entries => { inView = entries[0].isIntersecting; queue(); }); visibility.observe(canvas);
      document.addEventListener('visibilitychange', queue); motion.addEventListener('change', queue);
      const lost = (event: Event) => { event.preventDefault(); stop = true; setReady(false); onFinish?.(); };
      canvas.addEventListener('webglcontextlost', lost);
      queue();
      return () => {
        stop = true; cancelAnimationFrame(frame); observer.disconnect();
        stage?.removeEventListener('journeyframe',queue); inertObserver.disconnect(); visibility.disconnect();
        document.removeEventListener('visibilitychange', queue); motion.removeEventListener('change', queue); canvas.removeEventListener('webglcontextlost', lost);
        gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(shader => gl.deleteShader(shader));
      };
    } catch (error) {
      console.error('Star artwork unavailable; keeping accessible navigation.', error);
      gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(shader => gl.deleteShader(shader));
      onFinish?.();
    }
  }, [kind, origin, onFinish, text]);
  return <span className={`star-object${ready ? ' is-ready' : ''}${origin ? ' star-flight-canvas' : ''}`}>
    <canvas ref={ref} aria-hidden="true" />
    {!origin && <span className="star-fallback" aria-hidden="true">{kind === 'name' ? text : '✦'}</span>}
  </span>;
}
