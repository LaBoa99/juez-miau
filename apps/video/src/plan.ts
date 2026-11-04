// Guion v3 "La bodega" (docs/design/video-demo-v2.md) en cuadros a 30 fps.
// Las coordenadas son del "mundo": cada punto es el centro de la pantalla de una caja.
import { Easing } from "remotion";
import voz from "./voz.json";

export const FPS = 30;
export const DURATION = 90 * FPS;
export const SCREEN = { w: 1600, h: 900 };

export type Pt = { x: number; y: number };

export const at = {
  cat: { x: 0, y: 0 },
  s1: { x: 2200, y: 0 },
  s2: { x: 4300, y: 0 },
  s3: { x: 6400, y: 0 },
  s4: { x: 8500, y: 0 },
  s5: { x: 10600, y: 0 },
  staff: { x: 12700, y: 0 },
  app: { x: 14800, y: 0 },
  board: { x: 16900, y: 0 },
  guard: { x: 14800, y: -1700 },
  projector: { x: 17100, y: -1750 },
} satisfies Record<string, Pt>;

export const PROJECTOR_SCALE = 1.25;

// Puntos dentro de una caja, relativos al centro de su pantalla.
export const LABEL = { x: 520, y: 565 }; // etiqueta térmica (donde caen los sellos)
export const STICKER = { x: -420, y: 570 }; // calcomanía USB
// Centros de cámara: etiqueta un poco arriba del centro (el subtítulo va abajo); calcomanía a la izquierda (el gato entra por la derecha).
export const LABEL_CAM = { x: LABEL.x + 60, y: LABEL.y + 20 };
export const STICKER_CAM = { x: STICKER.x + 250, y: STICKER.y - 150 };
export const SUBMIT = { x: 540, y: 360 }; // botón "Enviar solución" de la app
export const SUSPEND = { x: 540, y: 250 }; // botón "Suspender" de anti-trampas
export const ROW_H = 100;
export const rowY = (i: number) => 130 + ROW_H * (i + 0.5) - SCREEN.h / 2; // fila i del marcador

// ---- Eventos (cuadro en que ocurren) ----
export const ev = {
  flapsOpen: 10,
  credPrint: 600,
  credLand: 690,
  login: 728,
  clockStart: 850, // cuando la voz dice "¡a programar!"
  submitWA: 945,
  verdictWA: 975,
  stampWA: 995,
  question: [1190, 1240],
  answer: [1290, 1340],
  submitAC: 1410,
  stampAC: 1462,
  climb: [1530, 1575],
  dim: [1620, 1645],
  detective: [1648, 1740], // el gato entra con su lupa y sale
  scan: [1656, 1671], // la lupa recorre la caja hasta la calcomanía
  usb: 1672,
  alert: 1700,
  suspend: 1900,
  undim: [1950, 1980],
  freeze: [2048, 2072],
  timeUp: 2200,
  unfreeze: 2215,
  champion: 2372,
  whipHome: 2432,
  catDuck: [2555, 2575], // con "…sin trampas", el gato se mete
  flapsClose: [2575, 2595],
  seal: [2592, 2610], // la cinta pega cuando la voz dice "sellada" (2595)
  closing: 2610,
} as const;

export const shakes = [ev.stampWA, ev.stampAC, ev.usb, ev.champion];

// Reloj: 5 h en cámara rápida hasta los últimos 5 s, que corren en tiempo real.
export const clockText = (f: number) => {
  const total = 5 * 3600;
  const last = ev.timeUp - 5 * FPS;
  let left = total;
  if (f >= ev.clockStart && f < last) {
    left = total - ((f - ev.clockStart) / (last - ev.clockStart)) * (total - 5);
  } else if (f >= last) {
    left = Math.max(0, 5 - (f - last) / FPS);
  }
  const s = Math.ceil(left);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

// ---- Cámara: puntos clave [cuadro, x, y, zoom, rotateX, rotateY] ----
export type Key = { f: number; x: number; y: number; z: number; rx: number; ry: number };
const k = (f: number, p: Pt, z: number, dx = 0, dy = 0, rx = 0, ry = 0): Key => ({
  f, x: p.x + dx, y: p.y + dy, z, rx, ry,
});
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Carrusel del staff: llega, se acerca poco a poco y viaja a la siguiente con un "salto" de zoom.
const staffBoxes = [at.s1, at.s2, at.s3, at.s4, at.s5];
const carousel = staffBoxes.flatMap((p, i) => {
  const f = 280 + i * 70;
  const next = staffBoxes[i + 1];
  return [
    k(f, p, 1.1),
    k(f + 40, p, 1.16),
    ...(next ? [k(f + 55, mid(p, next), 0.5, 0, 0, 0, i % 2 ? -8 : 8)] : []),
  ];
});

const P = PROJECTOR_SCALE;
export const keys: Key[] = [
  // 1. El gatito en su caja
  k(0, at.cat, 2.0, 0, -400),
  k(140, at.cat, 1.6, 0, -300),
  // 2. Se revela la bodega
  k(215, mid(at.cat, at.s1), 0.42),
  k(240, mid(at.cat, at.s1), 0.4),
  // 3. Staff
  ...carousel,
  // 4. Credenciales vuelan a la app
  k(620, { x: 11600, y: 0 }, 0.45),
  k(660, { x: 13700, y: -200 }, 0.45),
  k(690, at.app, 1.1),
  k(750, at.app, 1.15),
  // 5. Arranque: sube al proyector para el 3-2-1 y baja con "¡a programar!"
  k(768, at.app, 1.12),
  k(792, at.projector, 0.9),
  k(862, at.projector, 0.93),
  // 6. Primer envío: WA (ningún acercamiento pasa de 1.35; la etiqueta queda arriba del subtítulo)
  k(900, at.app, 1.05),
  k(925, at.app, 1.3, SUBMIT.x, SUBMIT.y),
  k(960, at.app, 1.32, SUBMIT.x, SUBMIT.y),
  k(990, at.app, 1.15, LABEL_CAM.x, LABEL_CAM.y),
  k(1035, at.app, 1.3, LABEL_CAM.x, LABEL_CAM.y),
  k(1060, at.board, 1.05),
  k(1085, at.board, 1.15, 0, rowY(3)),
  k(1140, at.board, 1.17, 0, rowY(3)),
  // 7. Aclaración
  k(1175, mid(at.staff, at.app), 0.48),
  k(1370, mid(at.staff, at.app), 0.52),
  // 8. Segundo envío: AC
  k(1405, at.app, 1.05),
  k(1440, at.app, 1.25, LABEL_CAM.x, LABEL_CAM.y),
  k(1480, at.app, 1.3, LABEL_CAM.x, LABEL_CAM.y),
  k(1510, at.board, 1.05),
  k(1530, at.board, 1.15, 0, rowY(3)),
  k(1575, at.board, 1.15, 0, rowY(0)),
  k(1640, at.board, 1.17, 0, rowY(0)),
  // 9. La USB: el gato revisa la caja con su lupa
  k(1652, at.app, 1.0, STICKER_CAM.x, STICKER_CAM.y), // barrido
  k(1735, at.app, 1.03, STICKER_CAM.x, STICKER_CAM.y),
  k(1752, mid(at.app, at.guard), 0.55),
  k(1780, at.guard, 1.05),
  k(1850, at.guard, 1.15),
  k(1880, at.guard, 1.3, SUSPEND.x, SUSPEND.y),
  k(1935, at.guard, 1.32, SUSPEND.x, SUSPEND.y),
  k(1980, at.guard, 1.1),
  // 10. Un solo paneo al proyector: se congela, se acaba el tiempo y se revela
  k(2025, at.projector, 0.9),
  k(2210, at.projector, 0.93),
  k(2260, at.projector, 0.95, 0, rowY(0) * P * 0.5),
  k(2335, at.projector, 0.97, 0, rowY(0) * P * 0.5),
  // 11. Campeón y regreso a casa
  k(2360, at.projector, 1.1, LABEL_CAM.x * P, LABEL_CAM.y * P),
  k(2420, at.projector, 1.15, LABEL_CAM.x * P, LABEL_CAM.y * P),
  k(ev.whipHome, at.projector, 1.0),
  k(2462, at.cat, 0.85, 380, -50), // barrido largo: el desenfoque tapa el recorrido
  k(2520, at.cat, 0.82, 400, -20),
  k(2700, at.cat, 0.72, 444, 120),
];

export const camEase = Easing.inOut(Easing.cubic);

// ---- Cinta azul: tramos que se desenrollan [desde, hasta, inicio, fin] ----
export type Segment = { a: Pt; b: Pt; from: number; to: number; color?: "red" };
const lbl = (p: Pt): Pt => ({ x: p.x, y: p.y + LABEL.y });
export const tape: Segment[] = [
  { a: lbl(at.cat), b: lbl(at.s1), from: 150, to: 240 },
  ...staffBoxes.slice(0, -1).map((p, i) => ({
    a: lbl(p), b: lbl(staffBoxes[i + 1]), from: 280 + i * 70 + 40, to: 280 + i * 70 + 70,
  })),
  { a: lbl(at.s5), b: lbl(at.staff), from: 600, to: 640 },
  { a: lbl(at.staff), b: lbl(at.app), from: 640, to: 690 },
  { a: lbl(at.app), b: lbl(at.board), from: 1030, to: 1060 },
  { a: lbl(at.app), b: lbl(at.guard), from: 1740, to: 1780, color: "red" },
  { a: lbl(at.board), b: { x: at.projector.x, y: at.projector.y + 700 }, from: 2045, to: 2075 },
];

// ---- Narración: voz (public/voz) y texto en pantalla, desde voz.json ----
export type VoiceLine = { id: string; at: number; text: string; frames: number; caption?: boolean; top?: boolean; words: [number, string][] };
export const voice = voz as unknown as VoiceLine[]; // JSON no conserva tuplas
// La página no reproduce con sonido: todo lo que dice la voz va también como texto.
export const lines = voice
  .filter((l) => l.caption !== false)
  .map((l) => ({ from: l.at, to: l.at + l.frames + 12, text: l.text, top: l.top }));

// "Tres, dos, uno… ¡a programar!" con el cuadro exacto de cada palabra (frase 04): números en el proyector y bips.
const countdownLine = voice.find((l) => l.id === "04")!;
const COUNT: Record<string, string> = { tres: "3", dos: "2", uno: "1", a: "¡A PROGRAMAR!" };
export const countdownMarks = countdownLine.words
  .filter(([, w]) => w.toLowerCase() in COUNT)
  .map(([f, w]): [number, string] => [countdownLine.at + f, COUNT[w.toLowerCase()]]);
