// Chrome sin ventana controlado por el protocolo de DevTools (sin dependencias: WebSocket viene en Node 22).
// Lo usa capturas.mjs para recorrer el panel de staff y tomar una captura por paso.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const W = 1920;
export const H = 1080;
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function abrir(base) {
  const profile = mkdtempSync(join(tmpdir(), "tutoriales-"));
  const chrome = spawn("google-chrome-stable", [
    "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    `--window-size=${W},${H}`, "--hide-scrollbars", "--force-device-scale-factor=1", "--lang=es-MX",
    "--no-first-run", "--mute-audio", "about:blank",
  ], { stdio: "ignore" });

  let targets;
  for (let i = 0; i < 50 && !targets; i++) {
    await sleep(200);
    targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json()).catch(() => null);
  }
  if (!targets) throw new Error("Chrome no abrió el puerto de DevTools");
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });

  let seq = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.error ? p.fail(new Error(msg.error.message)) : p.ok(msg.result);
  };
  const send = (method, params = {}) =>
    new Promise((ok, fail) => { const id = ++seq; pending.set(id, { ok, fail }); ws.send(JSON.stringify({ id, method, params })); });

  await send("Page.enable");
  // Al doble de resolución: el video hace zoom a las capturas y así no se ven borrosas
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: false });
  // Sin animaciones del panel a medias en las capturas (la tira del reloj, por ejemplo)
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

  const evaluar = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? expr);
    return r.result.value;
  };

  // Busca por CSS o por texto visible ("texto=Guardar": el más chico que lo contenga, mejor si es exacto).
  const FIND = `(q) => {
    const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    if (!q.startsWith('texto=')) return [...document.querySelectorAll(q)].find(visible) ?? null;
    const t = q.slice(6).trim().toLowerCase();
    const all = [...document.querySelectorAll('button, a, label, th, td, li, h1, h2, h3, span, p, option, summary, div')]
      .filter((e) => visible(e) && e.textContent.trim().toLowerCase().includes(t));
    const leaves = all.filter((e) => !all.some((o) => o !== e && e.contains(o)));
    // Primero el que dice exactamente eso ("Responder" antes que "Sin responder (1)")
    return leaves.find((e) => e.textContent.trim().toLowerCase() === t) ?? leaves[0] ?? null;
  }`;
  const caja = (q) => evaluar(`(() => { const e = (${FIND})(${JSON.stringify(q)}); if (!e) return null;
    e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })()`);

  const esperar = async (q, ms = 10000) => {
    for (let t = 0; t < ms; t += 200) {
      const b = await caja(q);
      if (b) return b;
      await sleep(200);
    }
    throw new Error(`No apareció: ${q}`);
  };

  const b = {
    send, evaluar, caja, esperar, sleep,
    async ir(path) {
      await send("Page.navigate", { url: base + path });
      await sleep(1800);
    },
    async clic(q) {
      const r = await esperar(q);
      const x = r.x + r.w / 2, y = r.y + r.h / 2;
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
        await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
      }
      await sleep(700);
      return r;
    },
    async escribir(q, texto) {
      await b.clic(q);
      await evaluar(`document.activeElement.select?.()`);
      await send("Input.insertText", { text: texto });
      await sleep(200);
    },
    // Select: elige la opción cuyo texto contiene `texto`. Otros campos (fecha): fija el valor tal cual.
    async elegir(q, texto) {
      await esperar(q);
      const ok = await evaluar(`(() => { const e = (${FIND})(${JSON.stringify(q)});
        if (e.tagName === 'SELECT') {
          const i = [...e.options].findIndex((o) => o.textContent.trim().toLowerCase().includes(${JSON.stringify(texto.toLowerCase())}));
          if (i < 0) return false;
          e.selectedIndex = i;
        } else e.value = ${JSON.stringify(texto)};
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
        return true; })()`);
      if (!ok) throw new Error(`No hay opción "${texto}" en ${q}`);
      await sleep(400);
    },
    async captura() {
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      return Buffer.from(data, "base64");
    },
    async cerrar() {
      ws.close();
      const salio = new Promise((r) => chrome.once("exit", r));
      chrome.kill();
      await salio; // Chrome sigue escribiendo el perfil hasta que sale
      // Sus procesos hijos pueden tardar en soltar el perfil: si no se borra, queda en /tmp y no importa
      try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {}
    },
  };
  return b;
}
