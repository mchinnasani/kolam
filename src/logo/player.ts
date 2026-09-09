import { validateLogo, prepareLogoPaths, type LogoData, type LogoSettings } from "./format";
const vertex = `
precision mediump float;
attribute vec2 a_start; attribute vec2 a_c1; attribute vec2 a_c2; attribute vec2 a_end;
attribute vec4 a_color; attribute float a_seed;
uniform vec2 u_fit; uniform float u_progress; uniform float u_time; uniform float u_size;
uniform float u_dpr; uniform float u_twinkle; uniform float u_palette;
varying vec4 v_color;
void main(){
 float t=clamp((u_progress-a_seed*.12)/.88,0.,1.); t=t*t*(3.-2.*t); float q=1.-t;
 vec2 p=q*q*q*a_start+3.*q*q*t*a_c1+3.*q*t*t*a_c2+t*t*t*a_end;
 gl_Position=vec4(p*u_fit,0.,1.);
 vec3 c=a_color.rgb; float blend=clamp(a_end.x*.5+a_end.y*.25+.5,0.,1.);
 if(u_palette>.5 && u_palette<1.5) c=mix(vec3(.27,1.,.79),vec3(.78,.33,1.),blend);
 if(u_palette>1.5 && u_palette<2.5) c=mix(vec3(1.,.8,.25),vec3(1.,.23,.36),blend);
 if(u_palette>2.5) c=mix(vec3(.25,.62,1.),vec3(.8,1.,1.),blend);
 float pulse=1.-u_twinkle*(.18+.18*sin(u_time*(.7+a_seed)+a_seed*123.));
 v_color=vec4(c*pulse,a_color.a); gl_PointSize=u_size*u_dpr*4.;
}`;
const fragment = `precision mediump float; varying vec4 v_color; uniform float u_glow;
void main(){float r=length(gl_PointCoord-.5);float core=1.-smoothstep(.07,.18,r);float halo=exp(-r*r*28.)*u_glow*.46;float a=(core+halo)*v_color.a;if(a<.008)discard;gl_FragColor=vec4(v_color.rgb*a,a);}`;
export type PlayerMetrics = { frameMs: number; drawCalls: number; particles: number; dpr: number };
/** GPU path playback: immutable buffers, one draw per active frame, no React dependency. */
export class LogoPlayer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private buffers: WebGLBuffer[] = [];
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private data: LogoData | null = null;
  private settings: LogoSettings | null = null;
  private raf = 0;
  private playing = false;
  private start = 0;
  private progress = 1;
  private visible = true;
  private dead = false;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)");
  private resizeObserver: ResizeObserver;
  private intersection: IntersectionObserver;
  private previous = 0;
  private slow = 0;
  private scale = 1;
  private clock = 0;
  private dpr = 1;
  onProgress?: (value: number) => void;
  onError?: (message: string) => void;
  onMetrics?: (value: PlayerMetrics) => void;
  private lastMetrics = 0;
  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    if (!gl)
      throw new Error("WebGL is unavailable. Enable hardware acceleration or try another browser.");
    this.gl = gl;
    const shaders: WebGLShader[] = [];
    const program = gl.createProgram();
    if (!program) throw new Error("Could not create the player.");
    this.program = program;
    try {
      for (const [type, source] of [
        [gl.VERTEX_SHADER, vertex],
        [gl.FRAGMENT_SHADER, fragment],
      ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("Could not allocate shader.");
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error("Could not compile particle shader.");
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error("Could not link particle shaders.");
    } catch (error) {
      gl.deleteProgram(program);
      throw error;
    } finally {
      shaders.forEach((s) => gl.deleteShader(s));
    }
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0.016, 0.021, 0.033, 1);
    for (const key of ["fit", "progress", "time", "size", "dpr", "twinkle", "palette", "glow"])
      this.uniforms[key] = gl.getUniformLocation(program, `u_${key}`);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(canvas);
    this.intersection = new IntersectionObserver((e) => {
      this.visible = e[0].isIntersecting;
      this.visibility();
    });
    this.intersection.observe(canvas);
    document.addEventListener("visibilitychange", this.visibility);
    this.reduced.addEventListener("change", this.motion);
    canvas.addEventListener("webglcontextlost", this.lost);
    this.resize();
  }
  private lost = (event: Event) => {
    event.preventDefault();
    this.pause();
    this.onError?.("Graphics context lost. Reload the page to restart the preview.");
  };
  private motion = () => {
    if (this.reduced.matches) {
      this.playing = false;
      this.progress = 1;
      this.onProgress?.(1);
    }
    this.wake();
  };
  private visibility = () => {
    if (document.hidden || !this.visible) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else {
      this.previous = 0;
      this.wake();
    }
  };
  private resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(devicePixelRatio || 1, 2) * this.scale;
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.wake();
  };
  load(data: LogoData) {
    validateLogo(data);
    this.data = data;
    this.settings = { ...data.settings };
    const gl = this.gl;
    this.buffers.forEach((b) => gl.deleteBuffer(b));
    this.buffers = [];
    const paths = prepareLogoPaths(data.points),
      attributes = new Float32Array((data.points.length / 6) * 5);
    for (let i = 0, j = 0; i < data.points.length; i += 6, j += 5) {
      attributes[j] = data.points[i + 2];
      attributes[j + 1] = data.points[i + 3];
      attributes[j + 2] = data.points[i + 4];
      attributes[j + 3] = data.points[i + 5];
      attributes[j + 4] = ((i / 6) * 0.61803398875) % 1;
    }
    const upload = (values: Float32Array) => {
      const b = gl.createBuffer();
      if (!b) throw new Error("Could not allocate particles.");
      this.buffers.push(b);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
    };
    gl.useProgram(this.program);
    upload(paths);
    for (const [name, offset] of [
      ["start", 0],
      ["c1", 8],
      ["c2", 16],
      ["end", 24],
    ] as const) {
      const a = gl.getAttribLocation(this.program, `a_${name}`);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 32, offset);
    }
    upload(attributes);
    for (const [name, size, offset] of [
      ["color", 4, 0],
      ["seed", 1, 16],
    ] as const) {
      const a = gl.getAttribLocation(this.program, `a_${name}`);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, size, gl.FLOAT, false, 20, offset);
    }
    this.seek(1);
  }
  configure(settings: LogoSettings) {
    if (!this.data) return;
    validateLogo({ ...this.data, settings });
    this.settings = { ...settings };
    this.wake();
  }
  seek(value: number) {
    if (!Number.isFinite(value)) throw new Error("Progress must be finite.");
    this.playing = false;
    this.progress = Math.max(0, Math.min(1, value));
    this.wake();
  }
  play() {
    if (!this.data) return;
    if (this.reduced.matches) {
      this.seek(1);
      this.onProgress?.(1);
      return;
    }
    this.progress = 0;
    this.playing = true;
    this.start = this.clock;
    this.wake();
  }
  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
  private wake = () => {
    if (!this.raf && !this.dead && !document.hidden && this.visible)
      this.raf = requestAnimationFrame(this.paint);
  };
  private paint = (now: number) => {
    this.raf = 0;
    if (!this.data || !this.settings || this.dead) return;
    const delta = this.previous ? Math.min(100, now - this.previous) : 16;
    this.previous = now;
    this.clock += delta / 1000;
    if (this.playing) {
      this.progress = Math.min(1, (this.clock - this.start) / this.settings.duration);
      this.onProgress?.(this.progress);
      if (this.progress === 1) this.playing = false;
    }
    const gl = this.gl,
      u = this.uniforms,
      w = this.canvas.width,
      h = this.canvas.height;
    gl.useProgram(this.program);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u.fit, (Math.min(w, h) / w) * 0.76, (Math.min(w, h) / h) * 0.76);
    gl.uniform1f(u.progress, this.progress);
    gl.uniform1f(u.time, this.reduced.matches ? 0 : this.clock);
    gl.uniform1f(
      u.size,
      this.settings.size * Math.max(0.5, Math.min(1.4, Math.min(w, h) / this.dpr / 600)),
    );
    gl.uniform1f(u.dpr, this.dpr);
    gl.uniform1f(u.glow, this.settings.glow);
    gl.uniform1f(u.twinkle, this.reduced.matches ? 0 : this.settings.twinkle);
    gl.uniform1f(u.palette, ["original", "aurora", "ember", "ice"].indexOf(this.settings.palette));
    gl.drawArrays(gl.POINTS, 0, this.data.points.length / 6);
    this.slow = delta > 28 ? this.slow + 1 : Math.max(0, this.slow - 1);
    if (this.slow > 90 && this.scale === 1) {
      this.scale = 0.7;
      this.resize();
    }
    if (now - this.lastMetrics > 500) {
      this.lastMetrics = now;
      this.onMetrics?.({
        frameMs: delta,
        drawCalls: 1,
        particles: this.data.points.length / 6,
        dpr: this.dpr,
      });
    }
    if (!this.reduced.matches && (this.playing || this.settings.twinkle > 0)) this.wake();
  };
  destroy() {
    this.dead = true;
    this.pause();
    this.resizeObserver.disconnect();
    this.intersection.disconnect();
    document.removeEventListener("visibilitychange", this.visibility);
    this.reduced.removeEventListener("change", this.motion);
    this.canvas.removeEventListener("webglcontextlost", this.lost);
    this.buffers.forEach((b) => this.gl.deleteBuffer(b));
    this.gl.deleteProgram(this.program);
  }
}
