import { Video } from "@remotion/media";
import React from "react";
import { Easing, Img, staticFile, useCurrentFrame } from "remotion";
import { Pt, SCREEN, Segment, ev, tape } from "./plan";
import { c, font, ramp } from "./theme";

// Caja con pantalla: 1840×1240, pantalla de 1600×900 en (120, 80).
const BW = 1840;
const BH = 1240;
const SX = 120;
const SY = 80;

const corrugated = `repeating-linear-gradient(90deg, rgba(0,0,0,.05) 0 7px, transparent 7px 26px), ${c.kraft}`;

export const ThermalLabel: React.FC<{ title: string; sub: string; style?: React.CSSProperties }> = ({ title, sub, style }) => (
  <div
    style={{
      width: 560, height: 190, background: c.label, color: c.labelInk, padding: "18px 24px",
      boxSizing: "border-box", fontFamily: font.mono, boxShadow: "0 6px 14px rgba(40,25,5,.35)",
      display: "flex", flexDirection: "column", justifyContent: "space-between", ...style,
    }}
  >
    <div style={{ fontSize: 22, color: c.labelDim, display: "flex", justifyContent: "space-between" }}>
      <span>JUEZ MIAU · CAJA</span><b style={{ color: c.labelInk }}>#1042</b>
    </div>
    <div style={{ fontFamily: font.sans, fontWeight: 800, fontSize: 44, lineHeight: 1 }}>{title}</div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 22 }}>
      <span style={{ width: 200, height: 34, background: `repeating-linear-gradient(90deg, ${c.labelInk} 0 3px, transparent 3px 6px, ${c.labelInk} 6px 10px, transparent 10px 13px)` }} />
      <span>{sub}</span>
    </div>
  </div>
);

// Huella de gato: la firma del juez en sellos y calcomanías.
export const Paw: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill={color} style={{ flexShrink: 0 }}>
    <ellipse cx="50" cy="68" rx="25" ry="21" />
    <ellipse cx="20" cy="42" rx="10" ry="13" transform="rotate(-22 20 42)" />
    <ellipse cx="39" cy="24" rx="10" ry="13" transform="rotate(-7 39 24)" />
    <ellipse cx="61" cy="24" rx="10" ry="13" transform="rotate(7 61 24)" />
    <ellipse cx="80" cy="42" rx="10" ry="13" transform="rotate(22 80 42)" />
  </svg>
);

export const Stamp: React.FC<{ f: number; until?: number; text: string; color: string; paw?: boolean; style?: React.CSSProperties }> = ({ f, until, text, color, paw, style }) => {
  const frame = useCurrentFrame();
  if (frame < f || (until !== undefined && frame >= until)) return null;
  return (
    <div
      style={{
        position: "absolute", padding: "6px 28px", border: `10px solid ${color}`, color, borderRadius: 14,
        fontFamily: font.stencil, fontSize: 96, letterSpacing: 4, textTransform: "uppercase",
        background: "rgba(255,255,255,.75)", translate: "-50% -50%",
        rotate: "-9deg",
        scale: ramp(frame, [f, f + 5], [1.8, 1], Easing.out(Easing.quad)),
        opacity: ramp(frame, [f, f + 3], [0, 1]),
        display: "flex", alignItems: "center", gap: 18, whiteSpace: "nowrap",
        ...style,
      }}
    >
      {paw && <Paw color={color} size={78} />}
      {text}
    </div>
  );
};

export const Sticker: React.FC<{ f: number; text: string }> = ({ f, text }) => {
  const frame = useCurrentFrame();
  if (frame < f) return null;
  return (
    <div
      style={{
        position: "absolute", left: 500, top: 1100, translate: "-50% -50%", padding: "18px 36px",
        background: c.sticker, color: "#fff", fontFamily: font.stencil, fontSize: 84, letterSpacing: 3,
        boxShadow: "0 8px 18px rgba(0,0,0,.4)", whiteSpace: "nowrap",
        rotate: `${ramp(frame, [f, f + 6], [14, 5])}deg`,
        scale: ramp(frame, [f, f + 6], [1.7, 1], Easing.out(Easing.back(2))),
        display: "flex", alignItems: "center", gap: 20,
      }}
    >
      <Paw color="#fff" size={72} />
      {text}
    </div>
  );
};

// Cinta de empaque que cruza la pantalla: se pega (from..to) y se arranca (rip).
export const TapeBand: React.FC<{ text: string; from: number; to: number; rip?: number; rotate?: number; width?: number }> = ({
  text, from, to, rip, rotate = -7, width = 1900,
}) => {
  const frame = useCurrentFrame();
  if (frame < from) return null;
  const p = ramp(frame, [from, to], [0, 1]);
  const fall = rip === undefined ? 0 : ramp(frame, [rip, rip + 25], [0, 1], Easing.in(Easing.quad));
  return (
    <div
      style={{
        position: "absolute", left: SX + SCREEN.w / 2, top: SY + SCREEN.h / 2, width, height: 150,
        translate: `-50% calc(-50% + ${fall * 1400}px)`, rotate: `${rotate + fall * 25}deg`, opacity: 1 - fall,
        clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`, background: c.tape, color: "#fff",
        boxShadow: "0 6px 16px rgba(0,0,0,.35)", display: "flex", alignItems: "center", overflow: "hidden",
        fontFamily: font.stencil, fontSize: 92, letterSpacing: 6, whiteSpace: "nowrap",
      }}
    >
      {Array(6).fill(`${text} · `).join("")}
    </div>
  );
};

export const Box: React.FC<{
  at: Pt; title: string; sub: string; side: string; scale?: number; clip?: string; children?: React.ReactNode; overlay?: React.ReactNode;
}> = ({ at, title, sub, side, scale = 1, clip, children, overlay }) => (
  <div
    style={{
      position: "absolute", left: at.x - SX - SCREEN.w / 2, top: at.y - SY - SCREEN.h / 2, width: BW, height: BH,
      transformOrigin: `${SX + SCREEN.w / 2}px ${SY + SCREEN.h / 2}px`, scale,
    }}
  >
    {/* solapas abiertas */}
    <div style={{ position: "absolute", left: 0, top: -250, width: BW / 2, height: 270, background: c.kraftDark, transformOrigin: "100% 100%", rotate: "-6deg", clipPath: "polygon(10% 0, 100% 0, 100% 100%, 0 100%)" }} />
    <div style={{ position: "absolute", left: BW / 2, top: -250, width: BW / 2, height: 270, background: c.kraftDark, transformOrigin: "0 100%", rotate: "6deg", clipPath: "polygon(0 0, 90% 0, 100% 100%, 0 100%)" }} />
    {/* frente */}
    <div style={{ position: "absolute", inset: 0, background: corrugated, borderRadius: 10, boxShadow: "0 40px 80px rgba(20,10,0,.55)" }} />
    <div style={{ position: "absolute", left: SX - 24, top: SY - 24, width: SCREEN.w + 48, height: SCREEN.h + 48, background: c.kraftIn, borderRadius: 18 }} />
    {/* pantalla */}
    <div
      style={{
        position: "absolute", left: SX, top: SY, width: SCREEN.w, height: SCREEN.h, overflow: "hidden",
        borderRadius: 10, background: "#111", boxShadow: "0 0 0 14px #1b1714", isolation: "isolate",
      }}
    >
      {clip ? <Video src={staticFile(clip)} muted objectFit="cover" style={{ width: "100%", height: "100%" }} /> : children}
    </div>
    <div style={{ position: "absolute", left: SX, top: 1020, fontFamily: font.stencil, fontSize: 110, color: c.ink, opacity: 0.85, letterSpacing: 4, lineHeight: 1 }}>
      {side}
    </div>
    <ThermalLabel title={title} sub={sub} style={{ position: "absolute", left: 1160, top: 1000 }} />
    {overlay}
  </div>
);

// Dónde caen los sellos: sobre el código de barras, sin tapar el nombre de la etiqueta.
export const labelSpot: React.CSSProperties = { left: 1560, top: 1172 };

// Conteo 3-2-1 en la pantalla del proyector, cada número cuando la voz lo dice.
export const Countdown: React.FC<{ marks: [number, string][] }> = ({ marks }) => {
  const frame = useCurrentFrame();
  const start = marks[0][0];
  const end = marks[marks.length - 1][0] + 30;
  if (frame < start - 8 || frame >= end) return null;
  let i = -1;
  marks.forEach(([f], j) => {
    if (frame >= f) i = j;
  });
  const fade = Math.min(ramp(frame, [start - 8, start], [0, 1]), ramp(frame, [end - 8, end], [1, 0]));
  const [f, text] = i >= 0 ? marks[i] : marks[0];
  const big = text.length === 1;
  return (
    <div style={{ position: "absolute", left: SX, top: SY, width: SCREEN.w, height: SCREEN.h, borderRadius: 10, background: "rgba(18,15,11,.9)", opacity: fade, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {i >= 0 && (
        <div
          style={{
            fontFamily: font.stencil, fontSize: big ? 620 : 220, lineHeight: 1, color: big ? "#E8B400" : "#fff", whiteSpace: "nowrap",
            rotate: big ? "-4deg" : "-2deg", scale: ramp(frame, [f, f + 6], [1.6, 1], Easing.out(Easing.quad)), opacity: ramp(frame, [f, f + 3], [0, 1]),
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
};

export const CatBox: React.FC<{ at: Pt }> = ({ at }) => {
  const frame = useCurrentFrame();
  const opening = ramp(frame, [ev.flapsOpen, ev.flapsOpen + 30], [0, 1]);
  const closing = ramp(frame, ev.flapsClose, [0, 1], Easing.inOut(Easing.cubic));
  const open = opening - closing;
  const rise = ramp(frame, [30, 70], [0, 1], Easing.out(Easing.back(1.4))) - ramp(frame, ev.catDuck, [0, 1], Easing.in(Easing.quad));
  const seal = ramp(frame, ev.seal, [0, 1]);
  const W = 1500;
  return (
    <div style={{ position: "absolute", left: at.x - W / 2, top: at.y - 200, width: W, height: 900 }}>
      {/* el gato se recorta en el fondo de la caja: nunca asoma por abajo */}
      <div style={{ position: "absolute", left: 0, right: 0, top: -1500, bottom: 0, overflow: "hidden" }}>
        <Img
          src={staticFile("gatito.svg")}
          style={{ position: "absolute", left: W / 2 - 450, top: 1500 + 80 - rise * 720, width: 900, height: 900, rotate: `${Math.sin(frame / 18) * 2}deg` }}
        />
      </div>
      {/* solapas: se despliegan al abrir y al cerrar se doblan hacia atrás (quedan como una franja de tapa) */}
      {[-1, 1].map((side) => (
        <div
          key={side}
          style={{
            position: "absolute", left: side < 0 ? 0 : W / 2, top: -6, width: W / 2, height: 300, background: c.kraftDark,
            transformOrigin: side < 0 ? "0 100%" : "100% 100%", translate: "0 -100%",
            transform: `perspective(1400px) rotateX(${78 * closing}deg)`, scale: `1 ${opening}`, rotate: `${side * 28 * open}deg`,
            filter: `brightness(${1 - 0.3 * closing})`,
          }}
        />
      ))}
      <div style={{ position: "absolute", inset: 0, background: corrugated, borderRadius: 10, boxShadow: "0 40px 80px rgba(20,10,0,.55)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 260, textAlign: "center", fontFamily: font.stencil, fontSize: 210, color: c.ink, letterSpacing: 8, lineHeight: 1 }}>
        JUEZ MIAU
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 500, textAlign: "center", fontFamily: font.mono, fontSize: 48, color: c.ink, opacity: 0.8 }}>
        ESTE LADO ARRIBA ↑↑ · FRÁGIL
      </div>
      {seal > 0 && (
        <div style={{ position: "absolute", left: -20, top: -40, height: 140, width: W + 40, background: c.tape, clipPath: `inset(0 ${(1 - seal) * 100}% 0 0)`, color: "#fff", fontFamily: font.stencil, fontSize: 84, letterSpacing: 6, display: "flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap", boxShadow: "0 6px 16px rgba(0,0,0,.35)" }}>
          JUEZ MIAU · CAJA SELLADA · JUEZ MIAU
        </div>
      )}
    </div>
  );
};

// Cinta azul de una caja a otra (pathLength=1 permite desenrollar con strokeDashoffset).
export const Tape: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <svg viewBox="-3000 -4000 26000 9000" style={{ position: "absolute", left: -3000, top: -4000, width: 26000, height: 9000, overflow: "visible" }}>
      {tape.map((s: Segment, i) => {
        const p = ramp(frame, [s.from, s.to], [0, 1]);
        if (p <= 0) return null;
        const dx = s.b.x - s.a.x;
        const dy = s.b.y - s.a.y;
        const bend = (i % 2 ? 1 : -1) * 0.22;
        const cx = (s.a.x + s.b.x) / 2 - dy * bend;
        const cy = (s.a.y + s.b.y) / 2 + dx * bend;
        const d = `M${s.a.x} ${s.a.y} Q${cx} ${cy} ${s.b.x} ${s.b.y}`;
        const color = s.color === "red" ? c.sticker : c.tape;
        return (
          <g key={i}>
            <path d={d} pathLength={1} fill="none" stroke="rgba(0,0,0,.3)" strokeWidth={96} strokeDasharray="1 1" strokeDashoffset={1 - p} transform="translate(0 14)" />
            <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={90} strokeDasharray="1 1" strokeDashoffset={1 - p} />
            <path d={d} pathLength={1} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth={14} strokeDasharray="1 1" strokeDashoffset={1 - p} transform="translate(0 -22)" />
          </g>
        );
      })}
    </svg>
  );
};

// Cursor grande que recorre puntos [cuadro, x, y] dentro de una pantalla y hace clic.
export const Cursor: React.FC<{ path: [number, number, number][]; clicks: number[] }> = ({ path, clicks }) => {
  const frame = useCurrentFrame();
  const first = path[0][0];
  const last = path[path.length - 1][0];
  if (frame < first - 8 || frame > last + 30) return null;
  let x = path[0][1];
  let y = path[0][2];
  for (let i = 0; i < path.length - 1; i++) {
    const [fa, xa, ya] = path[i];
    const [fb, xb, yb] = path[i + 1];
    if (frame >= fa) {
      x = ramp(frame, [fa, fb], [xa, xb]);
      y = ramp(frame, [fa, fb], [ya, yb]);
    }
  }
  const click = clicks.find((f) => frame >= f && frame < f + 14);
  return (
    <>
      {click !== undefined && (
        <div style={{ position: "absolute", left: x, top: y, width: 120, height: 120, borderRadius: "50%", border: `8px solid ${c.tape}`, translate: "-50% -50%", scale: ramp(frame, [click, click + 14], [0.2, 1.4]), opacity: ramp(frame, [click, click + 14], [1, 0]) }} />
      )}
      <svg width={64} height={64} viewBox="0 0 24 24" style={{ position: "absolute", left: x - 6, top: y - 4, filter: "drop-shadow(0 4px 6px rgba(0,0,0,.5))", scale: click !== undefined ? 0.85 : 1 }}>
        <path d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.6 L12 14 L19 14 Z" fill="#fff" stroke="#000" strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    </>
  );
};

// Algo que vuela por el mundo en arco de a → b (credenciales, aclaraciones).
export const Flyer: React.FC<{ a: Pt; b: Pt; from: number; to: number; lift: number; spin?: number; children: React.ReactNode }> = ({
  a, b, from, to, lift, spin = 0, children,
}) => {
  const frame = useCurrentFrame();
  if (frame < from - 10 || frame > to + 2) return null;
  const t = ramp(frame, [from, to], [0, 1], Easing.inOut(Easing.cubic));
  return (
    <div
      style={{
        position: "absolute", left: a.x + (b.x - a.x) * t, top: a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * lift,
        translate: "-50% -50%", rotate: `${spin * t}deg`, scale: ramp(frame, [from - 10, from], [0, 1], Easing.out(Easing.back(2))),
      }}
    >
      {children}
    </div>
  );
};
