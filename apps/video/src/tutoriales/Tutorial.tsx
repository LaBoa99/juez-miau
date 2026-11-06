import { Audio } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { font, ramp } from "../theme";

// Tutorial del panel de staff: capturas reales (scripts/capturas.mjs) con zoom al elemento, cursor, resaltado,
// subtítulo y la voz (scripts/voz_tutoriales.py). Estética de la bodega del sitio: fondo oscuro, cinta y stencil.

type Caja = { x: number; y: number; w: number; h: number };
export type Paso = { img: string; voz: string; caja: Caja | null; accion: "clic" | "escribir" | null; frames?: number };
export type Datos = { id: string; titulo: string; tituloFrames?: number; pasos: Paso[] };

const W = 1920;
const H = 1080;
const BG = "#120F0B";
const INK = "#EDE8DF";
const TAPE = "#3463EC";
const MOVE = 24; // cuadros que tarda la cámara en ir al siguiente elemento
const VOICE_AT = 10; // la voz entra cuando la cámara ya casi llegó

export const intro = (d: Datos) => Math.max((d.tituloFrames ?? 45) + 35, 80);
export const OUTRO = 70;
export const pasoDur = (p: Paso) => Math.max((p.frames ?? 60) + VOICE_AT + 18, 70);
export const duracion = (d: Datos) => intro(d) + d.pasos.reduce((n, p) => n + pasoDur(p), 0) + OUTRO;

type Cam = { s: number; tx: number; ty: number };

// Zoom para que el elemento llene buena parte del cuadro, sin enseñar los bordes de la captura.
const camara = (caja: Caja | null): Cam => {
  if (!caja) return { s: 1, tx: 0, ty: 0 };
  const s = Math.min(1.7, Math.max(1, Math.min(W / (caja.w + 700), H / (caja.h + 520))));
  const clampT = (v: number, size: number) => Math.min(0, Math.max(size - s * size, v));
  return { s, tx: clampT(W / 2 - s * (caja.x + caja.w / 2), W), ty: clampT(H / 2 - s * (caja.y + caja.h / 2), H) };
};
const mezcla = (a: Cam, b: Cam, t: number): Cam => ({ s: a.s + (b.s - a.s) * t, tx: a.tx + (b.tx - a.tx) * t, ty: a.ty + (b.ty - a.ty) * t });
// La punta del cursor cae abajo a la derecha del centro para no tapar lo que señala
const centro = (caja: Caja | null) =>
  caja ? { x: caja.x + Math.min(caja.w * 0.75, caja.w / 2 + 40), y: caja.y + Math.min(caja.h * 0.75, caja.h / 2 + 24) } : { x: W / 2, y: H / 2 };

const Cinta: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: TAPE, color: "#fff", fontFamily: font.stencil, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1, ...style }}>
    {children}
  </div>
);

const Cursor: React.FC<{ x: number; y: number; press: number }> = ({ x, y, press }) => (
  <svg width={44} height={44} viewBox="0 0 24 24" style={{ position: "absolute", left: x - 6, top: y - 3, scale: `${1 - 0.15 * press}`, transformOrigin: "6px 3px", filter: "drop-shadow(0 4px 6px rgba(0,0,0,.45))" }}>
    <path d="M5 2 L5 19 L9.5 15 L12.5 22 L15.5 20.7 L12.6 14 L18.5 14 Z" fill="#fff" stroke="#141210" strokeWidth={1.4} strokeLinejoin="round" />
  </svg>
);

const PasoView: React.FC<{ d: Datos; i: number }> = ({ d, i }) => {
  const f = useCurrentFrame();
  const p = d.pasos[i];
  const prev = d.pasos[i - 1];
  const dur = pasoDur(p);
  const t = ramp(f, [0, MOVE], [0, 1]);
  const cam = mezcla(camara(prev?.caja ?? null), camara(p.caja), t);
  const toScreen = (x: number, y: number) => ({ x: cam.tx + cam.s * x, y: cam.ty + cam.s * y });

  // La captura nueva aparece sobre la anterior (lo que pasó tras el clic del paso previo)
  const fade = prev ? ramp(f, [0, 10], [0, 1]) : 1;
  const from = centro(prev?.caja ?? null);
  const to = centro(p.caja);
  const cur = { x: from.x + (to.x - from.x) * ramp(f, [4, MOVE + 8], [0, 1]), y: from.y + (to.y - from.y) * ramp(f, [4, MOVE + 8], [0, 1]) };
  const clickAt = dur - 16;
  const press = p.accion ? interpolate(f, [clickAt - 3, clickAt, clickAt + 5], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const ripple = p.accion ? ramp(f, [clickAt, clickAt + 14], [0, 1]) : 0;
  const hl = p.caja ? ramp(f, [MOVE - 6, MOVE + 6], [0, 1]) : 0;

  const img = (src: string, opacity = 1) => (
    <Img src={staticFile(`tutoriales/${d.id}/${src}`)} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, opacity }} />
  );
  const box = p.caja && (() => {
    const a = toScreen(p.caja.x - 8, p.caja.y - 8);
    const b = toScreen(p.caja.x + p.caja.w + 8, p.caja.y + p.caja.h + 8);
    return { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y };
  })();
  const sc = toScreen(cur.x, cur.y);

  return (
    <AbsoluteFill style={{ background: BG }}>
      <div style={{ position: "absolute", width: W, height: H, transformOrigin: "0 0", transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})` }}>
        {prev && fade < 1 && img(prev.img)}
        {img(p.img, fade)}
      </div>
      {box && (
        <div style={{ position: "absolute", ...box, borderRadius: 12, border: `5px solid ${TAPE}`, opacity: hl, boxShadow: `0 0 0 4000px rgba(18,15,11,${0.45 * hl})` }} />
      )}
      {ripple > 0 && ripple < 1 && (
        <div style={{ position: "absolute", left: sc.x - 40 * ripple, top: sc.y - 40 * ripple, width: 80 * ripple, height: 80 * ripple, borderRadius: "50%", border: `4px solid ${TAPE}`, opacity: 1 - ripple }} />
      )}
      {p.caja && <Cursor x={sc.x} y={sc.y} press={press} />}

      {/* Subtítulo: etiqueta blanca como las del sitio */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 56, display: "flex", justifyContent: "center", opacity: ramp(f, [VOICE_AT - 4, VOICE_AT + 4], [0, 1]) }}>
        <div style={{ maxWidth: 1500, background: "#fff", color: "#141210", fontFamily: font.sans, fontWeight: 800, fontSize: 40, lineHeight: 1.25, letterSpacing: "-0.015em", padding: "18px 30px", borderRadius: 6, boxShadow: "0 12px 30px rgba(0,0,0,.35)", textAlign: "center" }}>
          {p.voz}
        </div>
      </div>
      <Cinta style={{ position: "absolute", left: 0, top: 36, fontSize: 30, padding: "10px 28px 8px 40px" }}>
        {d.titulo} · {i + 1}/{d.pasos.length}
      </Cinta>

      <Sequence from={VOICE_AT} layout="none">
        <Audio src={staticFile(`tutoriales/${d.id}/${p.img.replace(".png", ".mp3")}`)} />
      </Sequence>
      {camara(prev?.caja ?? null).s !== camara(p.caja).s && (
        <Audio src={staticFile("sfx/swoosh.mp3")} volume={0.18} />
      )}
      {p.accion === "clic" && (
        <Sequence from={clickAt - 2} layout="none">
          <Audio src={staticFile("sfx/clic-mouse.mp3")} volume={0.55} />
        </Sequence>
      )}
      {p.accion === "escribir" && (
        <Sequence from={clickAt - 10} layout="none">
          <Audio src={staticFile("sfx/tecleo.mp3")} volume={0.3} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

const Portada: React.FC<{ d: Datos; final?: boolean }> = ({ d, final }) => {
  const f = useCurrentFrame();
  const enter = ramp(f, [0, 22], [0, 1]);
  return (
    <AbsoluteFill style={{ background: BG, color: INK, alignItems: "center", justifyContent: "center", gap: 40 }}>
      <Img src={staticFile("gatito.svg")} style={{ width: 220, height: 220, scale: `${0.8 + 0.2 * enter}`, opacity: enter }} />
      <Cinta style={{ fontSize: 44, padding: "12px 34px 10px", rotate: "-1.5deg", opacity: enter }}>
        {final ? "Juez Miau · Tutoriales" : "Tutorial"}
      </Cinta>
      <div style={{ fontFamily: font.stencil, fontWeight: 800, fontSize: 120, lineHeight: 0.92, textTransform: "uppercase", textAlign: "center", maxWidth: 1600, translate: `0 ${(1 - enter) * 30}px`, opacity: enter }}>
        {final ? "¡Listo!" : d.titulo}
      </div>
      {!final && (
        <Sequence from={10} layout="none">
          <Audio src={staticFile(`tutoriales/${d.id}/00.mp3`)} />
        </Sequence>
      )}
      <Audio src={staticFile(final ? "sfx/ding.mp3" : "sfx/cinta.mp3")} volume={0.3} />
    </AbsoluteFill>
  );
};

export const Tutorial: React.FC<{ datos: Datos }> = ({ datos: d }) => {
  let at = intro(d);
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Sequence durationInFrames={intro(d)}>
        <Portada d={d} />
      </Sequence>
      {d.pasos.map((p, i) => {
        const from = at;
        at += pasoDur(p);
        return (
          <Sequence key={p.img} from={from} durationInFrames={pasoDur(p)}>
            <PasoView d={d} i={i} />
          </Sequence>
        );
      })}
      <Sequence from={at} durationInFrames={OUTRO}>
        <Portada d={d} final />
      </Sequence>
    </AbsoluteFill>
  );
};
