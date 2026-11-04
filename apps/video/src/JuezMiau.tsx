import React from "react";
import { AbsoluteFill, Easing, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Box, CatBox, Countdown, Flyer, Stamp, Sticker, Tape, TapeBand, ThermalLabel, labelSpot } from "./parts";
import { BurstSpec, Bursts, Confetti, Motes } from "./Particles";
import { Key, LABEL, PROJECTOR_SCALE, Pt, STICKER, SUSPEND, at, camEase, countdownMarks, ev, keys, lines, rowY, shakes } from "./plan";
import { Sound } from "./Sound";
import { AppScreen, Board, GuardScreen, StaffPanel, StaffScreen } from "./screens";
import { c, font, ramp } from "./theme";

const camAt = (f: number): Key => {
  if (f <= keys[0].f) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (f < b.f) {
      const t = camEase((f - a.f) / (b.f - a.f));
      return {
        f, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z * Math.pow(b.z / a.z, t), // zoom perceptual
        rx: a.rx + (b.rx - a.rx) * t, ry: a.ry + (b.ry - a.ry) * t,
      };
    }
  }
  return keys[keys.length - 1];
};

// Sacudida corta cuando cae un sello o la calcomanía.
const shake = (f: number) => {
  let x = 0;
  let y = 0;
  for (const s of shakes) {
    if (f >= s && f < s + 14) {
      const a = 16 * Math.exp(-(f - s) / 4);
      x += a * Math.sin((f - s) * 2.7);
      y += a * Math.cos((f - s) * 3.1);
    }
  }
  return { x, y };
};

const lbl = (p: { x: number; y: number }) => ({ x: p.x + LABEL.x, y: p.y + LABEL.y });


// Punto dentro de una caja (coordenadas locales de la caja, como labelSpot) llevado al mundo.
const inBox = (box: Pt, local: { left: number; top: number } | Pt, scale = 1): Pt => {
  const l = "left" in local ? { x: local.left, y: local.top } : local;
  return { x: box.x + (l.x - 920) * scale, y: box.y + (l.y - 530) * scale };
};
const spot = { x: labelSpot.left as number, y: labelSpot.top as number };
const KRAFT = [c.kraft, c.kraftDark, "#E2C9A0"];
const GOLD = ["#E8B400", "#FFE27A", "#FFFFFF"];

// Polvo de cartón en cada golpe y destellos en cada acierto.
const bursts: BurstSpec[] = [
  { at: { x: at.cat.x, y: at.cat.y - 210 }, f: ev.flapsOpen + 14, kind: "dust", colors: KRAFT, n: 24, speed: 34, size: 44 },
  { at: lbl(at.app), f: ev.credLand, kind: "dust", colors: KRAFT, n: 16 },
  ...countdownMarks.map(([f, t]): BurstSpec =>
    t.length === 1
      ? { at: at.projector, f, kind: "spark", colors: GOLD, n: 12, speed: 40, size: 46 }
      : { at: at.projector, f, kind: "spark", colors: [...GOLD, c.tape], n: 36, speed: 60, size: 60, life: 36 },
  ),
  { at: inBox(at.app, spot), f: ev.stampWA, kind: "dust", colors: [...KRAFT, c.bad], n: 18 },
  { at: inBox(at.app, spot), f: ev.stampAC, kind: "dust", colors: KRAFT, n: 14 },
  { at: inBox(at.app, spot), f: ev.stampAC, kind: "spark", colors: [c.ok, "#7FE0A8", "#FFFFFF"], n: 22, speed: 34, size: 40 },
  { at: { x: at.board.x + 420, y: at.board.y + rowY(0) }, f: ev.climb[1], kind: "spark", colors: GOLD, n: 18, speed: 30, size: 34 },
  { at: inBox(at.app, { x: 500, y: 1100 }), f: ev.usb, kind: "dust", colors: [...KRAFT, c.sticker], n: 22, speed: 32, size: 36 },
  { at: { x: at.guard.x + SUSPEND.x, y: at.guard.y + SUSPEND.y }, f: ev.suspend, kind: "spark", colors: [c.bad, "#FFFFFF"], n: 12, speed: 24, size: 28 },
  { at: inBox(at.projector, spot, PROJECTOR_SCALE), f: ev.champion, kind: "spark", colors: GOLD, n: 30, speed: 44, size: 50 },
  { at: inBox(at.projector, spot, PROJECTOR_SCALE), f: ev.champion, kind: "dust", colors: KRAFT, n: 16 },
  { at: { x: at.cat.x, y: at.cat.y - 200 }, f: ev.flapsClose[1], kind: "dust", colors: KRAFT, n: 26, speed: 36, size: 44 },
];

const Bubble: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ padding: "26px 40px", background: c.label, color: c.labelInk, borderRadius: 26, fontFamily: font.sans, fontSize: 64, fontWeight: 800, whiteSpace: "nowrap", boxShadow: "0 16px 30px rgba(0,0,0,.4)" }}>
    {children}
  </div>
);

const World: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      {/* piso de cartón */}
      <div style={{ position: "absolute", left: -6000, top: -7000, width: 32000, height: 15000, background: `repeating-linear-gradient(0deg, rgba(0,0,0,.08) 0 10px, transparent 10px 40px), ${c.floor}` }} />
      {/* banda transportadora */}
      <div style={{ position: "absolute", left: -2000, top: 760, width: 21000, height: 200, background: "#24201C", boxShadow: "0 20px 40px rgba(0,0,0,.5)" }}>
        <div style={{ position: "absolute", inset: "24px 0", backgroundImage: "repeating-linear-gradient(90deg, #3A342D 0 60px, #2C2722 60px 120px)", backgroundPositionX: -frame * 8 }} />
      </div>
      {/* repisa de arriba */}
      <div style={{ position: "absolute", left: 13600, top: -1040, width: 5400, height: 70, background: "#5E482D", boxShadow: "0 20px 40px rgba(0,0,0,.5)" }} />
      <Tape />

      <CatBox at={at.cat} />
      <Box at={at.s1} side="EDICIÓN" title="Edición 2026" sub="1 / 5">
        <StaffScreen nav="Ediciones" title="Ediciones" action="+ Nueva edición" from={270} head={["Nombre", "Inicio", "Duración", "Estado"]}
          rows={[["Edición 2026", "14 nov · 9:00", "5 h", "Borrador"], ["Edición 2025", "15 nov · 9:00", "5 h", "Cerrada"], ["Simulacro", "7 nov · 10:00", "2 h", "Cerrada"]]} />
      </Box>
      <Box at={at.s2} side="SALONES" title="Salones" sub="2 / 5">
        <StaffScreen nav="Salones" title="Salones" action="+ Nuevo salón" from={340} head={["Salón", "Equipos", "Proyector"]}
          rows={[["Laboratorio 1", "14", "Sí"], ["Laboratorio 2", "14", "Sí"], ["Aula magna", "12", "Sí"]]} />
      </Box>
      <Box at={at.s3} side="EQUIPOS" title="Equipos" sub="3 / 5">
        <StaffScreen nav="Equipos" title="Equipos" action="Importar CSV" from={410} head={["Equipo", "Categoría", "Salón"]}
          rows={[["Los Segfault", "Avanzado", "Lab 1"], ["Null Pointers", "Avanzado", "Lab 1"], ["Off by One", "Básico", "Lab 2"], ["Bit a Bit", "Básico", "Aula magna"]]} />
      </Box>
      <Box at={at.s4} side="PROBLEMAS" title="Problemas" sub="4 / 5">
        <StaffScreen nav="Problemas" title="Problemas" action="+ Casos de prueba" from={480} head={["Problema", "Casos", "Tiempo", "Memoria"]}
          rows={[["A · Rutas en la sierra", "12", "1 s", "256 MB"], ["B · Bits gemelos", "20", "2 s", "256 MB"], ["C · Ajolote", "15", "1 s", "128 MB"]]} />
      </Box>
      <Box at={at.s5} side="LENGUAJES" title="Lenguajes" sub="5 / 5">
        <StaffScreen nav="Lenguajes" title="Lenguajes" action="Guardar" from={550} head={["Lenguaje", "Versión", "Activo"]}
          rows={[["C", "gcc 13", "✓"], ["C++", "g++ 13 · C++17", "✓"], ["Java", "21", "✓"], ["Python", "3.12", "✓"], ["JavaScript", "Node 22", "✓"], ["C#", ".NET 8", "✓"]]} />
      </Box>
      <Box at={at.staff} side="STAFF" title="Panel del staff" sub="jueza">
        <StaffPanel />
      </Box>
      <Box
        at={at.app} side="EQUIPO" title="Los Segfault" sub="app .exe"
        overlay={
          <>
            <Stamp f={ev.stampWA} until={ev.stampAC} text="WA" color={c.bad} style={labelSpot} />
            <Stamp f={ev.stampAC} text="AC" color={c.ok} paw style={labelSpot} />
            <Sticker f={ev.usb} text="USB DETECTADA" />
          </>
        }
      >
        <AppScreen />
      </Box>
      <Box at={at.board} side="MARCADOR" title="Marcador" sub="en vivo" overlay={<TapeBand text="CONGELADO" from={ev.freeze[0]} to={ev.freeze[1]} rip={ev.unfreeze} />}>
        <Board />
      </Box>
      <Box at={at.guard} side="INTEGRIDAD" title="Anti-trampas" sub="solo staff">
        <GuardScreen />
      </Box>
      <Box
        at={at.projector} scale={PROJECTOR_SCALE} side="PROYECTOR" title="Proyector" sub="pantalla grande"
        overlay={
          <>
            <Countdown marks={countdownMarks} />
            <TapeBand text="MARCADOR CONGELADO" from={ev.freeze[0]} to={ev.freeze[1]} rip={ev.unfreeze} />
            <Stamp f={ev.champion} text="CAMPEÓN" color={c.warn} style={labelSpot} />
          </>
        }
      >
        <Board projector />
      </Box>

      <Flyer a={lbl(at.s5)} b={lbl(at.app)} from={615} to={ev.credLand} lift={900} spin={360}>
        <ThermalLabel title="Los Segfault" sub="usuario: segfault" />
      </Flyer>
      <Flyer a={{ x: at.app.x, y: -700 }} b={{ x: at.staff.x, y: -700 }} from={ev.question[0]} to={ev.question[1]} lift={300}>
        <Bubble>¿N puede ser 0?</Bubble>
      </Flyer>
      <Flyer a={{ x: at.staff.x, y: -700 }} b={{ x: at.app.x, y: -700 }} from={ev.answer[0]} to={ev.answer[1]} lift={300}>
        <Bubble>Sí, puede ser 0</Bubble>
      </Flyer>
      <Bursts list={bursts} />
    </>
  );
};

// focus: cámara de la lupa (mismo ángulo que la principal, centrada en un punto y con más aumento, sin desenfoque ni sacudida).
const Camera: React.FC<{ children: React.ReactNode; focus?: Pt & { zoom: number } }> = ({ children, focus }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const main = camAt(frame);
  const cam = focus ? { ...main, x: focus.x, y: focus.y, z: main.z * focus.zoom } : main;
  const prev = camAt(frame - 1);
  // Desenfoque según la velocidad en pantalla: los barridos se ven borrosos solos.
  const speed = Math.hypot((main.x - prev.x) * main.z, (main.y - prev.y) * main.z) + Math.abs(Math.log(main.z / prev.z)) * 1800;
  const blur = focus ? 0 : Math.min(14, Math.max(0, (speed - 45) / 22));
  const s = focus ? { x: 0, y: 0 } : shake(frame);
  return (
    <AbsoluteFill style={{ perspective: 2600, filter: blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : undefined, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute", left: 0, top: 0, transformOrigin: "0 0",
          transform: `translate(${width / 2 + s.x}px, ${height / 2 + s.y}px) rotateX(${cam.rx}deg) rotateY(${cam.ry}deg) scale(${cam.z}) translate(${-cam.x}px, ${-cam.y}px)`,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};

const Lights: React.FC = () => {
  const frame = useCurrentFrame();
  const dim = ramp(frame, ev.dim, [0, 0.65]) - ramp(frame, ev.undim, [0, 0.65]);
  return (
    <>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 30%, #000 100%)", opacity: dim }} />
      <AbsoluteFill style={{ background: "#000", opacity: ramp(frame, [0, 15], [1, 0]) }} />
    </>
  );
};

// El gato detective: se asoma por la esquina con su lupa, y una burbuja de aumento recorre la caja hasta la USB.
const CAT = 640;
const Detective: React.FC = () => {
  const frame = useCurrentFrame();
  const [a, b] = ev.detective;
  if (frame < a || frame > b + 18) return null;
  const show = ramp(frame, [a, a + 16], [0, 1], Easing.out(Easing.back(1.3))) - ramp(frame, [b, b + 16], [0, 1], Easing.in(Easing.quad));
  const nod = frame >= 1709 && frame < 1730 ? Math.sin(((frame - 1709) / 21) * Math.PI * 2) * 6 : 0; // "Yo lo veo"
  const cat = { x: 1920 - CAT - 10, y: 1080 - CAT + 60 + (1 - show) * 720 };
  const lupa = { x: cat.x + CAT * 0.76, y: cat.y + CAT * 0.77 };
  // Lo que mira la lupa (en el mundo): baja por la caja hasta la calcomanía y ahí tiembla un poco.
  const t = ramp(frame, ev.scan, [0, 1], Easing.inOut(Easing.cubic));
  const look = {
    x: at.app.x + STICKER.x + (1 - t) * 700 + Math.sin(frame / 5) * 6 * t,
    y: at.app.y + STICKER.y - (1 - t) * 420 + Math.cos(frame / 6) * 5 * t,
  };
  const cam = camAt(frame);
  const p = { x: 960 + (look.x - cam.x) * cam.z, y: 540 + (look.y - cam.y) * cam.z };
  // Al encontrar la USB la burbuja se cierra para que la calcomanía se lea completa.
  const lens = Math.max(0, show) * ramp(frame, [ev.usb + 8, ev.usb + 20], [1, 0], Easing.in(Easing.quad));
  const r = 190 * lens;
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <line x1={lupa.x} y1={lupa.y} x2={p.x} y2={p.y} stroke="#fff" strokeWidth={8} strokeDasharray="4 18" strokeLinecap="round" opacity={0.9 * lens} />
      </svg>
      <AbsoluteFill style={{ clipPath: `circle(${r}px at ${p.x}px ${p.y}px)` }}>
        <div style={{ position: "absolute", inset: 0, translate: `${p.x - 960}px ${p.y - 540}px` }}>
          <Camera focus={{ ...look, zoom: 1.8 }}>
            <World />
          </Camera>
        </div>
      </AbsoluteFill>
      {r > 20 && <div style={{ position: "absolute", left: p.x - r, top: p.y - r, width: r * 2, height: r * 2, borderRadius: "50%", border: `14px solid ${c.ink}`, boxShadow: "0 0 0 6px #CFE5FA, 0 18px 40px rgba(0,0,0,.5)", boxSizing: "border-box" }} />}
      <Img src={staticFile("gatito.svg")} style={{ position: "absolute", left: cat.x, top: cat.y, width: CAT, height: CAT, rotate: `${-6 + nod}deg`, transformOrigin: "50% 100%" }} />
    </AbsoluteFill>
  );
};

const Caption: React.FC = () => {
  const frame = useCurrentFrame();
  const line = lines.find((l) => frame >= l.from && frame < l.to);
  if (!line) return null;
  const inOut = Math.min(ramp(frame, [line.from, line.from + 10], [0, 1]), ramp(frame, [line.to - 8, line.to], [1, 0]));
  return (
    <div
      style={{
        position: "absolute", left: 80, ...(line.top ? { top: 90 } : { bottom: 90 }), maxWidth: 1180, padding: "22px 34px", background: c.label, color: c.labelInk,
        boxShadow: "0 12px 30px rgba(0,0,0,.45)", opacity: inOut, translate: `0 ${(1 - inOut) * 40}px`, rotate: "-1deg",
      }}
    >
      <div style={{ fontFamily: font.mono, fontSize: 22, color: c.labelDim, marginBottom: 6 }}>JUEZ MIAU DICE</div>
      <div style={{ fontFamily: font.sans, fontSize: 48, fontWeight: 800, lineHeight: 1.15 }}>{line.text}</div>
    </div>
  );
};

const Closing: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < ev.closing) return null;
  const p = ramp(frame, [ev.closing, ev.closing + 20], [0, 1]);
  return (
    <div style={{ position: "absolute", right: 80, top: 140, width: 720, padding: "44px 48px", background: c.label, color: c.labelInk, boxShadow: "0 20px 50px rgba(0,0,0,.5)", opacity: p, translate: `${(1 - p) * 120}px 0`, rotate: "1.5deg" }}>
      <div style={{ fontFamily: font.stencil, fontSize: 120, lineHeight: 0.95 }}>Caja sellada.</div>
      <div style={{ fontFamily: font.sans, fontSize: 40, fontWeight: 800, margin: "18px 0 26px" }}>Rápido, parejo y sin trampas.</div>
      {["Cada envío en su caja", "Veredicto en segundos", "Código abierto"].map((t) => (
        <div key={t} style={{ fontFamily: font.mono, fontSize: 34, padding: "10px 0", borderTop: `2px dashed ${c.labelDim}` }}>✓ {t}</div>
      ))}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 28 }}>
        <span style={{ fontFamily: font.mono, fontSize: 25, fontWeight: 700, whiteSpace: "nowrap", marginRight: 20 }}>laboa99.github.io/juez-miau</span>
        <Img src={staticFile("logo-cuvalles.svg")} style={{ height: 54 }} />
      </div>
    </div>
  );
};

export const JuezMiau: React.FC = () => (
  <AbsoluteFill style={{ background: c.floor }}>
    <Camera>
      <World />
    </Camera>
    <AbsoluteFill>
      <Motes />
    </AbsoluteFill>
    <Lights />
    <AbsoluteFill>
      <Confetti f={ev.unfreeze + 8} />
    </AbsoluteFill>
    <Detective />
    <Caption />
    <Closing />
    <Sound />
  </AbsoluteFill>
);
