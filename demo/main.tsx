import { normalizeForeground, type Foreground } from "../src/logo/foreground";
import { standaloneHtml } from "../src/logo/html";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { LogoPlayer, type PlayerMetrics } from "../src/logo/player";
import {
  samplePixels,
  encodeLogo,
  decodeLogo,
  defaults,
  type LogoData,
  type LogoSettings,
} from "../src/logo/format";
import "./studio.css";

const bytes = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function example(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 480;
  const x = c.getContext("2d")!;
  x.translate(240, 240);
  x.strokeStyle = "#ffffff";
  x.lineWidth = 15;
  x.lineCap = "round";
  x.lineJoin = "round";
  for (let i = 0; i < 6; i++) {
    x.save();
    x.rotate((i * Math.PI) / 3);
    x.beginPath();
    x.moveTo(0, -22);
    x.bezierCurveTo(-95, -66, -74, -170, 0, -170);
    x.bezierCurveTo(74, -170, 95, -66, 0, -22);
    x.stroke();
    x.restore();
  }
  return c;
}
function App() {
  const canvas = useRef<HTMLCanvasElement>(null),
    player = useRef<LogoPlayer | null>(null),
    source = useRef<HTMLCanvasElement | null>(null),
    scrub = useRef<HTMLInputElement>(null),
    progressText = useRef<HTMLOutputElement>(null),
    uploadTicket = useRef(0);
  const [data, setData] = useState<LogoData | null>(null),
    [settings, setSettings] = useState<LogoSettings>({ ...defaults }),
    [spacing, setSpacing] = useState(6),
    [backgroundMode, setBackgroundMode] = useState<"auto" | "alpha">("auto"),
    [padding, setPadding] = useState(0.06),
    [sensitivity, setSensitivity] = useState(1),
    [foreground, setForeground] = useState<Foreground | null>(null),
    [normalization, setNormalization] = useState<{
      width: number;
      height: number;
      scale: number;
    } | null>(null);
  const originalDimensions = useRef({ width: 480, height: 480 });
  const [name, setName] = useState("Kolam mark"),
    [sourceSize, setSourceSize] = useState<number | null>(null),
    [packed, setPacked] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [metrics, setMetrics] = useState<PlayerMetrics | null>(null),
    [dragging, setDragging] = useState(false),
    [sourceVersion, setSourceVersion] = useState(0),
    [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const p = new LogoPlayer(canvas.current!);
      player.current = p;
      p.onError = setError;
      p.onMetrics = setMetrics;
      p.onProgress = (v) => {
        if (scrub.current) scrub.current.value = String(v);
        if (progressText.current) progressText.current.value = `${Math.round(v * 100)}%`;
      };
      setReady(true);
      source.current = example();
      setSourceVersion((v) => v + 1);
      return () => {
        p.destroy();
        player.current = null;
      };
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (!source.current) return;
    const c = source.current,
      pixels = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    const worker = new Worker(new URL("../src/logo/foreground.worker.ts", import.meta.url), {
      type: "module",
    });
    setBusy(true);
    setForeground(null);
    setData(null);
    setError("");
    worker.onmessage = (event) => {
      setBusy(false);
      if (event.data.error) {
        setError(event.data.error);
        player.current?.pause();
        return;
      }
      setForeground(event.data.result);
    };
    worker.onerror = () => {
      setBusy(false);
      setError("Image analysis could not finish. Try a smaller image.");
    };
    worker.postMessage(
      { pixels, width: c.width, height: c.height, options: { mode: backgroundMode, sensitivity } },
      [pixels.buffer],
    );
    return () => worker.terminate();
  }, [sourceVersion, backgroundMode, sensitivity]);
  useEffect(() => {
    if (!foreground) return;
    try {
      const normalized = normalizeForeground(foreground, padding);
      const next = samplePixels(
        normalized.pixels,
        normalized.width,
        normalized.height,
        spacing,
        false,
      );
      setNormalization({ width: normalized.width, height: normalized.height, scale: normalized.scale });
      setData(next);
      setError("");
    } catch (e) {
      setData(null);
      setError((e as Error).message);
    }
  }, [foreground, padding, spacing]);
  useEffect(() => {
    if (data && player.current) {
      try {
        player.current.load(data);
        player.current.configure(settings);
        player.current.play();
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }, [data, ready]);
  useEffect(() => {
    player.current?.configure(settings);
  }, [settings]);
  useEffect(() => {
    let stale = false;
    if (data)
      void encodeLogo({ ...data, settings })
        .then((b) => {
          if (!stale) setPacked(b.length);
        })
        .catch((e) => {
          if (!stale) setError(e.message);
        });
    return () => {
      stale = true;
    };
  }, [data, settings]);
  async function openFile(file?: File) {
    if (!file) return;
    const ticket = ++uploadTicket.current;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (file.size > 8_000_000) throw new Error("Choose a file smaller than 8 MB.");
      if (file.name.toLowerCase().endsWith(".kolam")) {
        const next = await decodeLogo(new Uint8Array(await file.arrayBuffer()));
        if (ticket !== uploadTicket.current) return;
        source.current = null;
        setForeground(null);
        setNormalization(null);
        setSourceVersion((v) => v + 1);
        setSettings(next.settings);
        setData(next);
        setName(file.name);
        setSourceSize(file.size);
        setNotice("Animation loaded. Upload an image to change dot spacing.");
        return;
      }
      if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type))
        throw new Error("Use a PNG, JPG, WebP, SVG, or .kolam animation.");
      const url = URL.createObjectURL(file);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        if (ticket !== uploadTicket.current) return;
        if (!image.naturalWidth || !image.naturalHeight)
          throw new Error("This image has no usable dimensions.");
        originalDimensions.current = { width: image.naturalWidth, height: image.naturalHeight };
        // Analyze before particle normalization. Bound analysis work without collapsing
        // ordinary padded images to the 480px particle resolution.
        const scale = Math.min(
          1,
          4096 / Math.max(image.naturalWidth, image.naturalHeight),
          Math.sqrt(4_194_304 / (image.naturalWidth * image.naturalHeight)),
        );
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.floor(image.naturalWidth * scale));
        c.height = Math.max(1, Math.floor(image.naturalHeight * scale));
        c.getContext("2d")!.drawImage(image, 0, 0, c.width, c.height);
        source.current = c;
        setName(file.name);
        setSourceSize(file.size);
        setSourceVersion((v) => v + 1);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      if (ticket === uploadTicket.current)
        setError(`Could not open this file. ${(e as Error).message}`);
    } finally {
      if (ticket === uploadTicket.current) setBusy(false);
    }
  }
  const change = <K extends keyof LogoSettings>(key: K, value: LogoSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));
  async function exportFile(kind: "data" | "html" | "png") {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "png") {
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.current!.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("PNG export failed."))),
            "image/png",
          ),
        );
        download(blob, "particle-logo.png");
      } else {
        const payload = await encodeLogo({ ...data, settings });
        if (kind === "data")
          download(new Blob([new Uint8Array(payload)], { type: "application/gzip" }), "logo.kolam");
        else {
          const response = await fetch(`${import.meta.env.BASE_URL}logo-player.js`);
          if (!response.ok)
            throw new Error("The standalone player is missing. Run npm run build:player first.");
          const code = (await response.text()).replace(/<\/script/gi, "<\\/script");
          let binary = "";
          for (const b of payload) binary += String.fromCharCode(b);
          const base64 = btoa(binary);
          const html = standaloneHtml(base64, code);
          download(new Blob([html], { type: "text/html" }), "particle-logo.html");
        }
      }
      setNotice(
        kind === "html"
          ? "Downloaded. Open the HTML file in your browser—no server needed."
          : kind === "data"
            ? "Animation downloaded. Import it here or load it with the player."
            : "PNG downloaded at the current preview size.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header>
        <a className="brand" href="./">
          <span className="brand-mark">✳</span> kolam<span className="badge">PARTICLE STUDIO</span>
        </a>
        <a
          className="source-link"
          href="https://github.com/mchinnasani/kolam"
          target="_blank"
          rel="noreferrer"
        >
          View source ↗
        </a>
      </header>
      <main>
        <section className="intro">
          <p className="eyebrow">FROM A MARK TO A LITTLE MAGIC</p>
          <h1>
            Your logo.
            <br />
            <span>A thousand little lights.</span>
          </h1>
          <p>
            Turn a logo into vibrant particles. Shape the color, add a little motion, and take it
            anywhere.
          </p>
        </section>
        <section className="studio" aria-label="Particle logo editor">
          <div className="preview-column">
            <div
              className={`preview ${dragging ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void openFile(e.dataTransfer.files[0]);
              }}
            >
              <div className="preview-top">
                <span>
                  <i /> LIVE CANVAS
                </span>
                <span>
                  {data ? `${(data.points.length / 6).toLocaleString()} dots` : "Preparing dots"}
                </span>
              </div>
              <canvas
                ref={canvas}
                role="img"
                aria-label="Live preview of your logo made from glowing particles"
              />
              {dragging && <div className="drop-overlay">Drop your logo here</div>}
              <div className="preview-bottom">
                <span>{name}</span>
                <span>
                  {settings.palette.toUpperCase()} / {settings.twinkle > 0 ? "TWINKLE" : "STILL"}
                </span>
              </div>
            </div>
            <div className="transport">
              <button
                className="replay"
                disabled={!ready || !data}
                onClick={() => player.current?.play()}
              >
                ↻ <span>Replay formation</span>
              </button>
              <label htmlFor="progress">SCATTER</label>
              <input
                ref={scrub}
                id="progress"
                aria-label="Formation progress"
                type="range"
                min="0"
                max="1"
                step=".001"
                defaultValue="1"
                onInput={(e) => {
                  const v = Number(e.currentTarget.value);
                  player.current?.seek(v);
                  if (progressText.current) progressText.current.value = `${Math.round(v * 100)}%`;
                }}
              />
              <output ref={progressText}>100%</output>
            </div>
            <div className="metrics">
              <div>
                <strong>{packed ? bytes(packed) : "—"}</strong>
                <span>animation file</span>
              </div>
              <div>
                <strong>{data ? bytes((data.points.length / 6) * 13 * 4) : "—"}</strong>
                <span>GPU point buffers</span>
              </div>
              <div>
                <strong>{metrics ? metrics.drawCalls : "—"}</strong>
                <span>draw per frame</span>
              </div>
              <div>
                <strong>{sourceSize ? bytes(sourceSize) : "Built-in"}</strong>
                <span>source image</span>
              </div>
            </div>
          </div>
          <aside aria-label="Logo controls">
            <div className="panel-title">
              <span>Make it yours</span>
              <span className="step">01—04</span>
            </div>
            <label className="upload" htmlFor="logo-file">
              <span className="upload-icon">↥</span>
              <strong>{busy ? "Working…" : "Choose your logo"}</strong>
              <span>or drop it on the canvas</span>
              <small>PNG · SVG · JPG · WEBP · .KOLAM</small>
            </label>
            <input
              id="logo-file"
              className="file-input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,.kolam"
              disabled={busy || !ready}
              onChange={(e) => {
                void openFile(e.currentTarget.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
            <p className="privacy">Stays in your browser. Nothing is uploaded.</p>
            <fieldset>
              <legend>
                01 <span>Color palette</span>
              </legend>
              <div className="palettes">
                {(["original", "aurora", "ember", "ice"] as const).map((p) => (
                  <button
                    key={p}
                    className={`palette ${p}`}
                    aria-pressed={settings.palette === p}
                    onClick={() => change("palette", p)}
                  >
                    <span />
                    <small>{p[0].toUpperCase() + p.slice(1)}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>
                02 <span>The dots</span>
              </legend>
              <label className="range-label" htmlFor="spacing">
                Spacing <output>{spacing}px</output>
              </label>
              <input
                id="spacing"
                type="range"
                min="4"
                max="12"
                step="1"
                value={spacing}
                disabled={!source.current}
                onChange={(e) => setSpacing(Number(e.target.value))}
              />
              <label className="range-label" htmlFor="size">
                Dot size <output>{settings.size.toFixed(1)}</output>
              </label>
              <input
                id="size"
                type="range"
                min=".5"
                max="6"
                step=".1"
                value={settings.size}
                onChange={(e) => change("size", Number(e.target.value))}
              />
              <label className="range-label" htmlFor="background-mode">
                Background
              </label>
              <select
                id="background-mode"
                value={backgroundMode}
                disabled={!source.current}
                onChange={(e) => setBackgroundMode(e.target.value as "auto" | "alpha")}
              >
                <option value="auto">Detect automatically</option>
                <option value="alpha">Keep image colors (alpha only)</option>
              </select>
              <label className="range-label" htmlFor="padding">
                Object padding<output>{Math.round(padding * 100)}%</output>
              </label>
              <input
                id="padding"
                type="range"
                min="0"
                max=".2"
                step=".01"
                value={padding}
                disabled={!source.current}
                onChange={(e) => setPadding(Number(e.target.value))}
              />
              <label className="range-label" htmlFor="sensitivity">
                Detail sensitivity<output>{sensitivity.toFixed(1)}</output>
              </label>
              <input
                id="sensitivity"
                type="range"
                min=".5"
                max="2"
                step=".1"
                value={sensitivity}
                disabled={!source.current || backgroundMode === "alpha"}
                onChange={(e) => setSensitivity(Number(e.target.value))}
              />
              {foreground && normalization && (
                <details className="extraction-debug">
                  <summary>Image framing details</summary>
                  <dl>
                    <dt>Original</dt>
                    <dd>
                      {originalDimensions.current.width} × {originalDimensions.current.height}
                    </dd>
                    <dt>Analyzed</dt>
                    <dd>
                      {foreground.info.originalWidth} × {foreground.info.originalHeight}
                    </dd>
                    <dt>Bounds (analyzed pixels)</dt>
                    <dd>
                      {foreground.info.bounds.x}, {foreground.info.bounds.y} · {foreground.width} ×{" "}
                      {foreground.height}
                    </dd>
                    <dt>Normalized</dt>
                    <dd>
                      {normalization.width} × {normalization.height}
                    </dd>
                    <dt>Foreground</dt>
                    <dd>{foreground.info.foregroundPercent.toFixed(2)}%</dd>
                    <dt>Strategy</dt>
                    <dd>{foreground.info.strategy}</dd>
                    <dt>Scale from crop</dt>
                    <dd>{normalization.scale.toFixed(3)}×</dd>
                    <dt>Regions kept</dt>
                    <dd>{foreground.info.components}</dd>
                  </dl>
                  {foreground.info.warning && <p>{foreground.info.warning}</p>}
                </details>
              )}
            </fieldset>
            <fieldset>
              <legend>
                03 <span>Light & motion</span>
              </legend>
              {(
                [
                  ["glow", "Glow"],
                  ["twinkle", "Twinkle"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="range-label" htmlFor={key}>
                    {label}
                    <output>{Math.round(settings[key] * 100)}%</output>
                  </label>
                  <input
                    id={key}
                    type="range"
                    min="0"
                    max="1"
                    step=".01"
                    value={settings[key]}
                    onChange={(e) => change(key, Number(e.target.value))}
                  />
                </div>
              ))}
              <label className="range-label" htmlFor="duration">
                Formation time<output>{settings.duration.toFixed(1)}s</output>
              </label>
              <input
                id="duration"
                type="range"
                min="1"
                max="10"
                step=".5"
                value={settings.duration}
                onChange={(e) => change("duration", Number(e.target.value))}
              />
            </fieldset>
            <fieldset className="export">
              <legend>
                04 <span>Take it with you</span>
              </legend>
              <button
                className="primary"
                disabled={!data || busy}
                onClick={() => void exportFile("html")}
              >
                Download interactive HTML <span>↗</span>
              </button>
              <div className="secondary">
                <button disabled={!data || busy} onClick={() => void exportFile("data")}>
                  Animation file ↓
                </button>
                <button disabled={!data || busy} onClick={() => void exportFile("png")}>
                  Still PNG ↓
                </button>
              </div>
              <p>HTML includes the player. Open it offline or embed it in your site.</p>
            </fieldset>
          </aside>
        </section>
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="message" role="status">
            {notice}
          </p>
        )}
        <section className="explanation">
          <div>
            <p className="eyebrow">LESS WORK. SAME LITTLE LIGHTS.</p>
            <h2>
              Store the shape.
              <br />
              Prepare the journey.
            </h2>
          </div>
          <div>
            <p>
              The image becomes a compact set of colored points. Their routes are prepared once; the
              GPU follows those routes as you play or scrub.
            </p>
            <p>
              No video frames. No image processing on every frame. Switch twinkle off and the
              settled preview stops drawing until you interact. File size depends on your logo—an
              animation can be larger than a small PNG.
            </p>
            <a href="https://github.com/mchinnasani/kolam#how-it-works">
              How the converter works ↗
            </a>
          </div>
        </section>
      </main>
      <footer>
        <span>
          kolam <span className="muted">/ made of little things</span>
        </span>
        <span>Built by Mokshith Chinnasani</span>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
