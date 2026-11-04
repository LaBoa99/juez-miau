import React from "react";
import { random, useCurrentFrame } from "remotion";
import { Pt } from "./plan";
import { c } from "./theme";

// Partículas deterministas (random con semilla): mismo resultado en cada render.

const STAR = "polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%)";

export type BurstSpec = {
  at: Pt; // en coordenadas del mundo
  f: number;
  kind: "dust" | "spark";
  colors: string[];
  n?: number;
  speed?: number;
  size?: number;
  life?: number;
};

// Estallido: las partículas salen del punto, frenan y se desvanecen. El polvo cae y crece; los destellos giran.
const Burst: React.FC<BurstSpec & { seed: string }> = ({ at, f, kind, colors, n = 18, speed = 26, size = 28, life = 30, seed }) => {
  const frame = useCurrentFrame();
  const t = frame - f;
  if (t < 0 || t > life) return null;
  const k = life / 3;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const r = (s: string) => random(`${seed}-${s}-${i}`);
        const angle = kind === "dust" ? Math.PI + r("a") * Math.PI : r("a") * Math.PI * 2; // el polvo sale hacia arriba y a los lados
        const d = speed * (0.4 + 0.6 * r("v")) * k * (1 - Math.exp(-t / k));
        const x = at.x + Math.cos(angle) * d;
        const y = at.y + Math.sin(angle) * d * (kind === "dust" ? 0.6 : 1) + (kind === "dust" ? 0.08 * t * t : 0);
        const s = size * (0.5 + r("s")) * (kind === "dust" ? 1.6 + t / life : 1 - 0.5 * (t / life));
        const fade = 1 - t / life;
        return (
          <div
            key={i}
            style={{
              position: "absolute", left: x - s / 2, top: y - s / 2, width: s, height: s,
              // el polvo es una nube suave (sin borde); el destello, una estrella sólida
              background: kind === "dust" ? `radial-gradient(circle, ${colors[i % colors.length]} 0%, transparent 70%)` : colors[i % colors.length],
              borderRadius: kind === "dust" ? "50%" : 0,
              clipPath: kind === "spark" ? STAR : undefined,
              opacity: (kind === "dust" ? 0.8 : 1) * fade,
              rotate: kind === "spark" ? `${r("rot") * 90 + t * 8}deg` : undefined,
            }}
          />
        );
      })}
    </>
  );
};

export const Bursts: React.FC<{ list: BurstSpec[] }> = ({ list }) => (
  <>
    {list.map((b, i) => (
      <Burst key={i} seed={`b${i}`} {...b} />
    ))}
  </>
);

// Confeti en pantalla (no en el mundo): cae de arriba con vaivén y giro.
export const Confetti: React.FC<{ f: number; n?: number; life?: number }> = ({ f, n = 150, life = 200 }) => {
  const frame = useCurrentFrame();
  const t = frame - f;
  if (t < 0 || t > life) return null;
  const colors = [c.tape, "#E8B400", c.sticker, c.ok, "#FFFFFF", c.kraft];
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const r = (s: string) => random(`confeti-${s}-${i}`);
        const y = -60 - r("y0") * 700 + (7 + r("vy") * 7) * t;
        if (y > 1140) return null;
        const x = r("x0") * 1920 + Math.sin(t / (8 + r("w") * 10) + r("p") * 6) * 40;
        const flip = Math.cos(t / (4 + r("f") * 4) + r("p") * 6);
        return (
          <div
            key={i}
            style={{
              position: "absolute", left: x, top: y, width: 14 + r("w2") * 10, height: 26, background: colors[i % colors.length],
              rotate: `${r("rot") * 360 + t * (4 + r("sp") * 8)}deg`, scale: `1 ${flip}`,
              opacity: Math.min(1, (life - t) / 25), boxShadow: "0 2px 4px rgba(0,0,0,.25)",
            }}
          />
        );
      })}
    </>
  );
};

// Polvo flotando en la bodega: motas lentas y tenues en toda la pantalla.
export const Motes: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      {Array.from({ length: 34 }, (_, i) => {
        const r = (s: string) => random(`mota-${s}-${i}`);
        const x = (r("x") * 2000 + frame * (0.15 + r("vx") * 0.3)) % 2000 - 40;
        const y = (((r("y") * 1160 - frame * (0.2 + r("vy") * 0.35)) % 1160) + 1160) % 1160 - 40;
        const s = 3 + r("s") * 5;
        return (
          <div
            key={i}
            style={{
              position: "absolute", left: x + Math.sin(frame / 40 + i) * 12, top: y, width: s, height: s, borderRadius: "50%",
              background: "#FFF3D6", opacity: (0.12 + r("o") * 0.18) * (0.6 + 0.4 * Math.sin(frame / 25 + i * 2)),
            }}
          />
        );
      })}
    </>
  );
};
