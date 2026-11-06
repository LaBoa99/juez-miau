// Recorre el panel de staff (ng serve + backend locales) y guarda, por tutorial, una captura por paso con lo que
// narra la voz y dónde está el elemento señalado. Después: scripts/voz_tutoriales.py y render.
//
// Uso:  node scripts/capturas.mjs [id ...]      (sin ids: todos)
// Entra con el superadmin de prueba de apps/backend/.env (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { abrir } from "./navegador.mjs";
import { GUIONES } from "./guiones.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PANEL_URL ?? "http://localhost:4200";
const API = process.env.API_URL ?? "http://localhost:3000/api/v1";

const env = readFileSync(join(ROOT, "../backend/.env"), "utf8");
const valor = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1].trim();

// Para preparar datos que en la vida real crea un equipo (preguntas, envíos, alertas)
// `auth`: token de otro usuario (un equipo); sin él va como el superadmin, y renueva su token (dura 15 min).
let token = null;
async function api(method, path, body, auth) {
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", ...((auth ?? token) ? { authorization: `Bearer ${auth ?? token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !auth && token) {
    token = null;
    token = (await api("POST", "/auth/staff/login", { email: valor("SEED_ADMIN_EMAIL"), password: valor("SEED_ADMIN_PASSWORD") })).accessToken;
    return api(method, path, body);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
token = (await api("POST", "/auth/staff/login", { email: valor("SEED_ADMIN_EMAIL"), password: valor("SEED_ADMIN_PASSWORD") })).accessToken;

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(GUIONES);
const b = await abrir(BASE);
try {
  await b.ir("/login");
  await b.escribir("#email", valor("SEED_ADMIN_EMAIL"));
  await b.escribir("#password", valor("SEED_ADMIN_PASSWORD"));
  await b.clic("button[type=submit]");
  await b.esperar("texto=Cerrar sesión");

  for (const id of ids) {
    const guion = GUIONES[id];
    if (!guion) throw new Error(`No existe el guion ${id}`);
    const dir = join(ROOT, "public/tutoriales", id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const pasos = [];

    // paso(voz, { en, clic, escribir, elegir }): captura ANTES de la acción para que el video muestre el cursor llegando.
    const paso = async (voz, { en, clic, escribir, elegir } = {}) => {
      const caja = en ? await b.esperar(en) : null;
      await b.sleep(400);
      const img = `${String(pasos.length + 1).padStart(2, "0")}.png`;
      writeFileSync(join(dir, img), await b.captura());
      pasos.push({ img, voz, caja, accion: escribir != null ? "escribir" : clic || elegir ? "clic" : null });
      if (escribir != null) await b.escribir(en, escribir);
      else if (elegir != null) await b.elegir(en, elegir);
      else if (clic) await b.clic(en);
      await b.sleep(900);
    };

    console.log(`· ${id}`);
    await guion.grabar({ ...b, paso, api });
    const datos = { id, titulo: guion.titulo, pasos };
    writeFileSync(join(ROOT, "src/tutoriales", `${id}.json`), JSON.stringify(datos, null, 2) + "\n");
  }
} finally {
  await b.cerrar();
}
