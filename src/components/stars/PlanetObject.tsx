'use client';

import { useEffect, useRef, useState } from 'react';
import type { FlightOrigin, StarKind } from './StarObject';
import { portalSources } from './scene-bridge';
import { loadPlanetPoints } from './planet-points';
import { optimizedAnimation, registerLayer, reportLayer } from '../animation/performance';
import { preparePlanetPaths } from '../animation/motion-paths';
import { planetVertex, preparedPlanetVertex, planetFragment } from './planet-shaders';

/** A colored point sculpture in one GPU draw, shared by the portal and its flight. */
export default function PlanetObject({ kind, active = false, origin, onFinish, assetBase = "/planets" }: {
  kind: Exclude<StarKind, 'name'>; active?: boolean; origin?: FlightOrigin; onFinish?: () => void; assetBase?: string;
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
    const shaders: WebGLShader[] = [];
    const optimized = optimizedAnimation();
    const stats = registerLayer(origin ? 'flight' : kind);
    const main = canvas.closest('main');
    let pointCount = 0;
    let motionBuffer: WebGLBuffer | null = null;
    let previousFrame = 0, slowFrames = 0, resolutionScale = 1;
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
    const stage = canvas.closest<HTMLElement>('.kolam-stage');
    let w = 1, h = 1, dpr = 1, compact = false;
    let centerX = 0, centerY = 0, radius = 1;
    try {
      program = gl.createProgram(); if (!program) throw new Error('Star program allocation failed');
      gl.attachShader(program, compile(gl.VERTEX_SHADER, optimized ? preparedPlanetVertex : planetVertex)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, planetFragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Star program link failed');
      // oxlint-disable-next-line react/react-compiler -- WebGL useProgram is not a React hook.
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      for (const [name, size, offset] of [['position',3,0],['colour',3,12],['seed',1,24],['layer',1,28]] as const) {
        const location = gl.getAttribLocation(program, `a_${name}`);
        gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location,size,gl.FLOAT,false,32,offset);
      }
      const uniforms = Object.fromEntries(['view','center','radius','time','hover','dpr','formation','emergence','sources[0]','surfaceRotation','cloudRotation','ringRotation'].map(key => [key, gl.getUniformLocation(program!, `u_${key}`)]));
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE);
      const resize = () => {
        const rect = canvas.getBoundingClientRect(); w = rect.width; h = rect.height;
        dpr = Math.min(devicePixelRatio, compact ? 2 : 1) * resolutionScale; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
        const orb = canvas.closest('.planet-orb')?.getBoundingClientRect();
        const bounds = stage?.getBoundingClientRect();
        centerX = compact || !orb ? w/2 : orb.left - (bounds?.left ?? 0) + orb.width/2;
        centerY = compact || !orb ? h/2 : h - (orb.top - (bounds?.top ?? 0)) - orb.height/2;
        radius = (orb?.width ?? Math.min(w,h)) * (kind === 'projects' ? .193 : .279);
      };
      resize();
      const paint = (now: number) => {
        frame = 0; if (stop || document.hidden || !inView) return;
        if (optimized && main?.inert) return;
        const began = performance.now();
        const delta = previousFrame ? now-previousFrame : 16; previousFrame = now;
        if (optimized && delta > 28 && delta < 100) slowFrames++; else slowFrames = Math.max(0,slowFrames-1);
        if (optimized && slowFrames > 90 && resolutionScale > .7) { resolutionScale=.7;resize(); }
        if (origin && motion.matches) { onFinish?.(); return; }
        const progress = origin || motion.matches || stage?.closest('[data-failed]') ? 1 : Number(stage?.style.getPropertyValue('--journey') || 0);
        const nextCompact = !origin && progress >= .92;
        if (nextCompact !== compact) {
          compact = nextCompact;
          canvas.toggleAttribute('data-compact',compact);
          resize();
        }
        // Before the handoff there are no planet pixels to render.
        if (!origin && progress <= .48) {
          gl.clear(gl.COLOR_BUFFER_BIT);
          if (!optimized && !motion.matches) frame = requestAnimationFrame(paint);
          return;
        }
        const elapsed = (now - start) / 1000;
        const t = origin ? Math.min(1, elapsed / 2.6) : 0;
        const ease = t * t * (3 - 2 * t);
        brightness += ((hover.current ? 1 : 0) - brightness) * .06;
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uniforms.view, w, h);
        gl.uniform2f(uniforms.center, origin ? origin.x + (w/2-origin.x)*ease : centerX, origin ? h-(origin.y+(h/2-origin.y)*ease) : centerY);
        gl.uniform1f(uniforms.radius, origin ? origin.radius * Math.exp(ease*Math.log(Math.max(w,h)*2.5/origin.radius)) : radius);
        const seconds = motion.matches ? 0 : now/1000;
        gl.uniform2f(uniforms.surfaceRotation,Math.cos(seconds*.065),Math.sin(seconds*.065));
        gl.uniform2f(uniforms.cloudRotation,Math.cos(seconds*.075),Math.sin(seconds*.075));
        gl.uniform2f(uniforms.ringRotation,Math.cos(seconds*.11),Math.sin(seconds*.11));
        gl.uniform1f(uniforms.time, motion.matches ? 0 : now / 1000);

        const offset = kind === 'about' ? 0 : kind === 'projects' ? .025 : .05;
        const formation = Math.max(0, Math.min(1, (progress - .5 - offset) / (.42 - offset)));
        gl.uniform1f(uniforms.formation, formation * formation * (3 - 2 * formation));
        const handoff = Math.max(0,Math.min(1,(progress-.48)/.1));
        gl.uniform1f(uniforms.emergence, handoff*handoff*(3-2*handoff));
        const sources = stage && portalSources.get(stage);
        if(sources) {
          const first = kind === 'about' ? 0 : kind === 'projects' ? 72 : 144;
          gl.uniform3fv(uniforms['sources[0]'],sources.positions.subarray(first,first+72));
        }
        gl.uniform1f(uniforms.hover, brightness);
        gl.uniform1f(uniforms.dpr, dpr);
        gl.drawArrays(gl.POINTS, 0, pointCount);
        reportLayer(stats,began,1,pointCount,dpr);
        if (!painted && pointCount > 0) { painted = true; setReady(true); }
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
      void loadPlanetPoints(kind, window.innerWidth < 760, assetBase).then(data => {
        if(stop) return;
        gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
        if (optimized) {
          motionBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,motionBuffer);
          gl.bufferData(gl.ARRAY_BUFFER,preparePlanetPaths(data),gl.STATIC_DRAW);
          const attribute = gl.getAttribLocation(program!, 'a_motion');
          gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute,4,gl.FLOAT,false,16,0);
        }
        pointCount=data.length/8; queue();
      }).catch(error => { if(!stop) { console.error('Planet point colors unavailable.',error); onFinish?.(); } });
      queue();
      return () => {
        stop = true; cancelAnimationFrame(frame); observer.disconnect();
        stage?.removeEventListener('journeyframe',queue); inertObserver.disconnect(); gl.deleteBuffer(motionBuffer); visibility.disconnect();
        document.removeEventListener('visibilitychange', queue); motion.removeEventListener('change', queue); canvas.removeEventListener('webglcontextlost', lost);
        gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(shader => gl.deleteShader(shader));
      };
    } catch (error) {
      console.error('Planet artwork unavailable; keeping accessible navigation.', error);
      gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(shader => gl.deleteShader(shader));
      onFinish?.();
    }
  }, [kind, origin, onFinish, assetBase]);
  return <span className={`star-object planet-object planet-material-${kind}${ready ? ' is-ready' : ''}${origin ? ' star-flight-canvas' : ''}`}>
    <canvas ref={ref} aria-hidden="true" />
    {!origin && <span className="star-fallback planet-points-fallback" aria-hidden="true">✦</span>}
  </span>;
}
