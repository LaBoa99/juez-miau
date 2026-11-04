import { Audio } from "@remotion/media";
import React from "react";
import { Sequence, interpolate, staticFile } from "remotion";
import { DURATION, countdownMarks, ev, voice } from "./plan";

type Sfx = [number, string, number];

// Movimientos grandes de cámara: el swoosh pega a la mitad del recorrido.
const moves = [178, 650, 780, 880, 1048, 1158, 1388, 1495, 1757, 2002];

// [cuadro del evento, archivo en public/sfx, volumen]. Créditos en docs/design/video-demo-mejoras.md.
const sfx: Sfx[] = [
  // la caja del gato
  [ev.flapsOpen + 8, "caja-abre", 0.7],
  [ev.flapsClose[0] + 10, "caja-cierra", 0.7],
  // la app: tecleo y clics
  [695, "tecleo", 0.35],
  [708, "tecleo", 0.3],
  [ev.login - 3, "clic-mouse", 0.6],
  [1255, "tecleo", 0.25], // el staff responde la aclaración
  [ev.submitWA, "clic-mouse", 0.6],
  [ev.submitAC, "clic-mouse", 0.6],
  [ev.suspend, "clic-mouse", 0.6],
  // arranque: un bip por número y campana con "¡a programar!"
  ...countdownMarks.map(([f, t]): Sfx => (t.length === 1 ? [f, "bip", 0.35] : [f, "campana", 0.5])),
  // movimientos
  ...moves.map((f): Sfx => [f, "swoosh", 0.35]),
  // golpes y momentos clave
  [ev.stampWA - 6, "whip", 0.6],
  [ev.stampWA, "sello", 0.5],
  [ev.stampAC, "sello", 0.5],
  [1646, "whip", 0.6],
  [ev.usb, "golpe", 0.5],
  [ev.timeUp, "campana", 0.6],
  [ev.unfreeze, "rasgar", 0.9],
  [ev.champion, "sello", 0.5],
  [ev.whipHome, "whip", 0.8],
  // riser: tensión que culmina en la USB y en la revelación del campeón
  [ev.usb, "riser", 0.2],
  [ev.unfreeze, "riser", 0.2],
  // el gato: maúlla al asomarse y, ya sellado, desde dentro de la caja
  [60, "miau", 0.5],
  [2670, "miau", 0.25],
  // destellos y burbujas (van con las partículas de JuezMiau)
  [ev.credPrint + 16, "papel", 0.4],
  [ev.question[0], "pop", 0.45],
  [ev.answer[0], "pop", 0.45],
  [ev.stampAC + 2, "brillo", 0.45],
  [ev.climb[1], "brillo", 0.35],
  [ev.champion + 2, "brillo", 0.5],
  [ev.closing, "pop", 0.4],
  // la USB: luces que bajan y suben, y la lupa
  [ev.dim[0], "interruptor", 0.5],
  [ev.undim[0], "interruptor", 0.4],
  [ev.scan[0], "lupa", 0.35],
  [ev.verdictWA, "error", 0.35],
  // cintas que se pegan, y el festejo del campeón
  [ev.freeze[0], "cinta", 0.45],
  [ev.seal[0], "cinta", 0.5],
  [ev.unfreeze + 8, "confeti", 0.55],
  [ev.unfreeze + 10, "festejo", 0.3],
];

// Cuadros entre el inicio del archivo y su golpe, para que el golpe caiga en el evento.
const hit: Record<string, number> = {
  "caja-abre": 6, "caja-cierra": 14, "clic-mouse": 4, swoosh: 12, rasgar: 3, riser: 59, sello: 1, whip: 1,
  miau: 20, papel: 16, confeti: 3, lupa: 15,
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// La música baja ~14 dB bajo la voz: empieza a bajar 1 s antes de la frase y sube 1.2 s después.
const musicVolume = (f: number) => {
  const talking = Math.max(
    0,
    ...voice.map((l) => interpolate(f, [l.at - 30, l.at, l.at + l.frames, l.at + l.frames + 36], [0, 1, 1, 0], clamp)),
  );
  const fade = interpolate(f, [0, 30, DURATION - 60, DURATION], [0, 1, 1, 0], clamp);
  return fade * (1 - 0.8 * talking);
};

export const Sound: React.FC = () => (
  <>
    <Audio src={staticFile("musica/night-on-the-docks.mp3")} volume={musicVolume} />
    {voice.map((l) => (
      <Sequence key={l.id} from={l.at} durationInFrames={l.frames + 5} name={`Voz ${l.id}`} layout="none">
        <Audio src={staticFile(`voz/${l.id}.mp3`)} />
      </Sequence>
    ))}
    {sfx.map(([f, name, volume], i) => (
      <Sequence key={i} from={f - (hit[name] ?? 0)} durationInFrames={120} name={name} layout="none">
        <Audio src={staticFile(`sfx/${name}.mp3`)} volume={volume} />
      </Sequence>
    ))}
  </>
);
