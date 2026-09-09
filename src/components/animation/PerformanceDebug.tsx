'use client';
import { useEffect } from 'react';
import { animationStats, enablePerformance, optimizedAnimation } from './performance';

/** Debug-only DOM HUD and repeatable native-scroll A/B run. No React frame updates. */
export default function PerformanceDebug() {
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has('perf') && !params.has('benchmark')) return;
    const disable = enablePerformance();
    const hud = document.createElement('output');
    hud.dataset.animationPerf = '';
    hud.setAttribute('aria-label', 'Animation performance');
    hud.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:9999;background:#080b12e8;color:#cfebff;padding:10px 14px;font:11px/1.5 monospace;white-space:pre;pointer-events:none;border:1px solid #ffffff25;border-radius:8px';
    document.body.appendChild(hud);
    const benchmark = params.has('benchmark');
    const frameTimes: number[] = [], cpuTimes: number[] = [];
    let raf = 0, last = 0, start = 0, lastHud = 0, done = false;
    let maxCalls = 0, worstDpr = 1, count = 0;
    const summarize = (values: number[]) => {
      const sorted = [...values].sort((a,b) => a-b);
      return { mean: values.reduce((a,b) => a+b,0)/Math.max(1,values.length), p95: sorted[Math.floor((sorted.length-1)*.95)] ?? 0 };
    };
    const run = (now: number) => {
      raf = 0;
      if (document.hidden) { last = 0; return; }
      if (!start) start = now;
      const delta = last ? now-last : 0; last = now;
      const elapsed = (now-start)/1000;
      let calls = 0, cpu = 0; count = 0;
      for (const layer of animationStats.values()) {
        calls += layer.calls; cpu += layer.cpu;
        count += layer.particles; worstDpr = Math.max(worstDpr,layer.dpr);
        layer.calls = 0; layer.cpu = 0;
      }
      maxCalls = Math.max(maxCalls,calls);
      if (benchmark && !done) {
        const hero = document.querySelector('.kolam-hero') as HTMLElement | null;
        if (hero) {
          const span = hero.offsetHeight-innerHeight;
          // 2s warm-up, 6s forward, 6s reverse, 6s forward, 3s settled.
          const p = elapsed < 2 ? 0 : elapsed < 8 ? (elapsed-2)/6 : elapsed < 14 ? 1-(elapsed-8)/6 : elapsed < 20 ? (elapsed-14)/6 : 1;
          window.scrollTo({top:hero.offsetTop+span*p,behavior:'instant'});
        }
        if (elapsed >= 2 && elapsed < 23 && delta > 0) { frameTimes.push(delta); cpuTimes.push(cpu); }
        if (elapsed >= 23) {
          done = true;
          const result = { mode: optimizedAnimation() ? 'paths' : 'baseline', frames:frameTimes.length, frameMs:summarize(frameTimes), renderCpuMs:summarize(cpuTimes), longFrames:frameTimes.filter(t=>t>34).length, maxDrawCalls:maxCalls, particles:count, dpr:worstDpr, viewport:[innerWidth,innerHeight] };
          hud.dataset.benchmarkResult = JSON.stringify(result);
          hud.textContent = JSON.stringify(result,null,2);
          return;
        }
      }
      if (now-lastHud > 250) {
        hud.textContent = `${optimizedAnimation() ? 'PATHS' : 'BASELINE'}${benchmark ? ' · A/B run' : ''}\nFPS ${delta ? (1000/delta).toFixed(0) : '—'} · frame ${delta.toFixed(1)} ms\nrender CPU ${cpu.toFixed(2)} ms\ndraw calls ${calls} (2D + WebGL)\nparticles ${count} · DPR ${worstDpr.toFixed(2)}`;
        lastHud = now;
      }
      raf = requestAnimationFrame(run);
    };
    const visibility = () => { if (document.hidden) { cancelAnimationFrame(raf);raf=0; } else if (!raf && !done) { start=0;last=0;frameTimes.length=0;cpuTimes.length=0;raf=requestAnimationFrame(run); } };
    document.addEventListener('visibilitychange',visibility);
    raf = requestAnimationFrame(run);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange',visibility); hud.remove();disable(); };
  }, []);
  return null;
}
