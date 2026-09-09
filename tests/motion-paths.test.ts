import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Native TypeScript test entry.
import { prepareMotionPaths, sampleMotionPath } from '../src/components/animation/motion-paths.ts';
// @ts-expect-error Native TypeScript test entry.
import { placeParticle, type Particle } from '../src/components/kolam/formation.ts';

const particles: Particle[] = Array.from({length:100},(_,i)=>({r0:5+i*.05,a0:i*.37,z0:3+i*.03,r1:1+i*.01,a1:i*.71,z1:.2,delay:i*.002,span:.35,drift:.025,phase:i*.7,speed:.4,tint:.5,size:.04}));
void test('prepared paths preserve endpoints and timing with bounded spatial error',()=>{
  const paths=prepareMotionPaths(particles);
  const actual={x:0,y:0,z:0,formed:0},expected={...actual};
  let error=0;
  for(let i=0;i<particles.length;i++) for(let k=0;k<=100;k++) {
    const progress=k/100;
    sampleMotionPath(paths,i,progress,2.75,actual);placeParticle(particles[i],progress,2.75,expected);
    error=Math.max(error,Math.hypot(actual.x-expected.x,actual.y-expected.y,actual.z-expected.z));
    assert.equal(actual.formed,expected.formed);
    if(k===0||k===100) assert.ok(Math.hypot(actual.x-expected.x,actual.y-expected.y,actual.z-expected.z)<.00001);
  }
  assert.ok(error<.02,`maximum path error ${error}`);
});
void test('scroll reversal is deterministic and does not mutate prepared geometry',()=>{
  const paths=prepareMotionPaths(particles), before=paths.knots.slice();
  const a={x:0,y:0,z:0,formed:0},b={...a};
  sampleMotionPath(paths,3,.4,0,a);
  for(const p of [.8,1,.2,0]) sampleMotionPath(paths,3,p,0,b);
  sampleMotionPath(paths,3,.4,0,b);
  assert.deepEqual(a,b);assert.deepEqual(paths.knots,before);
});
// @ts-expect-error Native TypeScript test entry.
import { makeCamera, projectPoint, projectPointInto } from '../src/lib/camera.ts';
void test('allocation-free projection matches the original camera projection',()=>{
  const camera=makeCamera({x:0,y:0,z:0},20,.9,.3,.7,1280,720);
  const scratch={x:0,y:0,depth:0};
  for(let i=0;i<100;i++) {
    const expected=projectPoint(camera,i*.1-5,Math.sin(i)*3,i*.05);
    assert.equal(projectPointInto(camera,i*.1-5,Math.sin(i)*3,i*.05,scratch),scratch);
    assert.deepEqual(scratch,expected);
  }
});
