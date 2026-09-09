export const planetVertex = `
precision highp float;
attribute vec3 a_position;
attribute vec3 a_colour;
attribute float a_seed;
attribute float a_layer;
uniform vec2 u_view;
uniform vec2 u_center;
uniform float u_radius;
uniform float u_time;
uniform float u_hover;
uniform float u_dpr;
uniform float u_formation;
uniform float u_emergence;
uniform vec3 u_sources[24];
uniform vec2 u_surfaceRotation;
uniform vec2 u_cloudRotation;
uniform vec2 u_ringRotation;
varying vec3 v_colour;
varying float v_light;
void main() {
  vec3 p = a_position;
  vec2 rotation = a_layer > 1.5 ? u_ringRotation : a_layer > .5 ? u_cloudRotation : u_surfaceRotation;
  p.xz = mat2(rotation.x,-rotation.y,rotation.y,rotation.x) * p.xz;
  if(a_layer > 1.5) p.yz = mat2(.94,.34,-.34,.94) * p.yz;
  p.xy = mat2(.91,.414,-.414,.91) * p.xy;
  float r = length(p.xy);
  float visible = a_layer < 1.5 ? step(0.,p.z) : (r >= 1. || p.z > sqrt(max(0.,1.-r*r)) ? 1. : 0.);
  vec3 n = normalize(p);
  float light = .19 + .81 * max(dot(n,normalize(vec3(-.6,.7,1.))),0.);
  float twinkle = .84 + .16*sin(u_time*(.7+a_seed*1.7+u_hover*.8)+a_seed*173.);
  v_light = 2.4 * visible * light * twinkle * (.65+a_seed*.55) * (1.+u_hover*.3);
  if(a_layer > 1.1 && a_layer < 1.5) v_light *= .15 + 2.8*pow(1.-max(n.z,0.),3.);
  v_colour = a_colour;
  float seed = a_seed*431. + a_position.y*17.;
  vec3 source = u_sources[int(floor(a_seed*23.999))];
  vec2 from = source.xy*u_view;
  float gather = smoothstep(a_seed*.3,1.,u_formation);
  vec2 destination = u_center+p.xy*u_radius;
  // Independent arcs prevent each source star from projecting a miniature planet.
  vec2 wander = vec2(sin(seed*17.13),cos(seed*31.7))*u_radius*2.8*sin(gather*3.14159265);
  vec2 delta = destination-from;
  vec2 bend = vec2(-delta.y,delta.x)*sin(gather*3.14159265)*.12;
  vec2 screen = mix(from,destination,gather)+bend+wander;
  float sparse = smoothstep(a_seed-.035,a_seed+.035,.035+.965*u_formation);
  v_light = mix(.035*source.z,v_light,u_formation)*sparse*u_emergence;
  v_colour = mix(vec3(.65,.76,1.),v_colour,u_formation);
  gl_Position = vec4(screen/u_view*2.-1.,0.,1.);
  // Dots grow during the flight so the surface resolves into individual stars.
  gl_PointSize = clamp((2.2+a_seed*.8)*sqrt(u_radius/60.)*(1.+u_hover*.1),1.1,24.)*u_dpr;
}`;
export const planetFragment = `
precision mediump float;
varying vec3 v_colour;
varying float v_light;
void main() {
  float r = length(gl_PointCoord-.5);
  if(r>.5 || v_light<.001) discard;
  float core = exp(-r*r*85.);
  float glow = exp(-r*r*22.)*.28;
  float alpha = (core+glow)*v_light;
  gl_FragColor = vec4(v_colour*alpha,alpha);
}`;

// Same paths and timing as the baseline, with seed-derived control data uploaded once.
export const preparedPlanetVertex = planetVertex
  .replace('attribute float a_layer;', 'attribute float a_layer;\nattribute vec4 a_motion;')
  .replace('u_sources[int(floor(a_seed*23.999))]', 'u_sources[int(a_motion.w)]')
  .replace('smoothstep(a_seed*.3,1.,u_formation)', 'smoothstep(a_motion.z,1.,u_formation)')
  .replace('vec2(sin(seed*17.13),cos(seed*31.7))', 'a_motion.xy');
