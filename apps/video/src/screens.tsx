// Pantallas de relleno hasta tener las grabaciones reales (apps/video/public/clips/).
import React from "react";
import { Easing, useCurrentFrame } from "remotion";
import { Cursor } from "./parts";
import { ROW_H, SCREEN, SUBMIT, SUSPEND, clockText, ev } from "./plan";
import { c, font, ramp } from "./theme";

const ui = { bg: "#F6F5F2", ink: "#151413", dim: "#6B6660", line: "#DEDAD3", side: "#151413" };
const field: React.CSSProperties = { height: 72, boxSizing: "border-box", display: "flex", alignItems: "center", lineHeight: 1 };

const Pending: React.FC<{ what: string }> = ({ what }) => (
  <div style={{ position: "absolute", left: "50%", translate: "-50% 0", top: 14, padding: "6px 14px", background: c.warn, color: "#fff", fontFamily: font.mono, fontSize: 20, borderRadius: 6, opacity: 0.85 }}>
    toma pendiente · {what}
  </div>
);

const NAV = ["Ediciones", "Categorías", "Salones", "Equipos", "Problemas", "Lenguajes", "Concurso", "Marcador", "Aclaraciones", "Anti-trampas"];

const Shell: React.FC<{ nav: string; title: string; children: React.ReactNode }> = ({ nav, title, children }) => (
  <div style={{ position: "absolute", inset: 0, background: ui.bg, display: "flex", fontFamily: font.sans, color: ui.ink }}>
    <div style={{ width: 300, background: ui.side, color: "#EDE8DF", padding: "34px 0", boxSizing: "border-box" }}>
      <div style={{ fontFamily: font.stencil, fontSize: 44, padding: "0 32px 26px" }}>JUEZ MIAU</div>
      {NAV.map((n) => (
        <div key={n} style={{ padding: "13px 32px", fontSize: 26, fontWeight: n === nav ? 800 : 400, background: n === nav ? "rgba(255,255,255,.12)" : undefined, borderLeft: n === nav ? `6px solid ${c.kraft}` : "6px solid transparent" }}>
          {n}
        </div>
      ))}
    </div>
    <div style={{ flex: 1, padding: "40px 48px", position: "relative" }}>
      <div style={{ fontSize: 58, fontWeight: 800, marginBottom: 28 }}>{title}</div>
      {children}
    </div>
  </div>
);

// Tabla genérica del panel: las filas aparecen una tras otra desde `from`.
export const StaffScreen: React.FC<{ nav: string; title: string; head: string[]; rows: string[][]; from: number; action: string }> = ({
  nav, title, head, rows, from, action,
}) => {
  const frame = useCurrentFrame();
  return (
    <Shell nav={nav} title={title}>
      <div style={{ position: "absolute", right: 48, top: 44, padding: "14px 28px", background: ui.ink, color: "#fff", borderRadius: 10, fontSize: 26, fontWeight: 600 }}>{action}</div>
      <div style={{ border: `2px solid ${ui.line}`, borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        <div style={{ display: "flex", padding: "18px 26px", background: "#EFECE6", fontSize: 22, fontWeight: 600, color: ui.dim }}>
          {head.map((h) => <div key={h} style={{ flex: 1 }}>{h}</div>)}
        </div>
        {rows.map((r, i) => {
          const f = from + 6 + i * 5;
          return (
            <div key={i} style={{ display: "flex", padding: "20px 26px", borderTop: `2px solid ${ui.line}`, fontSize: 28, opacity: ramp(frame, [f, f + 6], [0, 1]), translate: `${ramp(frame, [f, f + 8], [40, 0])}px 0` }}>
              {r.map((cell, j) => <div key={j} style={{ flex: 1, fontFamily: j === 0 ? font.sans : font.mono, fontWeight: j === 0 ? 600 : 500 }}>{cell}</div>)}
            </div>
          );
        })}
      </div>
      <Pending what={title} />
    </Shell>
  );
};

const Toast: React.FC<{ f: number; text: string; color: string }> = ({ f, text, color }) => {
  const frame = useCurrentFrame();
  if (frame < f || frame > f + 90) return null;
  return (
    <div style={{ position: "absolute", right: 30, bottom: 120, width: 560, padding: "22px 28px", background: "#fff", borderLeft: `14px solid ${color}`, borderRadius: 10, boxShadow: "0 12px 30px rgba(0,0,0,.3)", fontFamily: font.sans, translate: `${ramp(frame, [f, f + 10], [620, 0])}px 0` }}>
      <div style={{ fontSize: 22, color: ui.dim }}>Juez Miau · Problema A</div>
      <div style={{ fontSize: 40, fontWeight: 800, color }}>{text}</div>
    </div>
  );
};

// App de escritorio de Los Segfault.
export const AppScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const btn = { x: SCREEN.w / 2 + SUBMIT.x, y: SCREEN.h / 2 + SUBMIT.y };
  if (frame < ev.login) {
    const typed = "segfault".slice(0, Math.max(0, Math.floor((frame - 695) / 3)));
    return (
      <div style={{ position: "absolute", inset: 0, background: "#1E1B18", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 60, fontFamily: font.sans }}>
        <div style={{ width: 720, padding: 44, background: ui.bg, borderRadius: 18 }}>
          <div style={{ fontFamily: font.stencil, fontSize: 64, marginBottom: 26 }}>JUEZ MIAU</div>
          <div style={{ fontSize: 24, color: ui.dim }}>Equipo</div>
          <div style={{ fontFamily: font.mono, fontSize: 34, padding: "14px 18px", border: `2px solid ${ui.line}`, borderRadius: 10, marginBottom: 18, background: "#fff", ...field }}>{typed}</div>
          <div style={{ fontSize: 24, color: ui.dim }}>Contraseña</div>
          <div style={{ fontFamily: font.mono, fontSize: 34, padding: "14px 18px", border: `2px solid ${ui.line}`, borderRadius: 10, marginBottom: 26, background: "#fff", ...field }}>{frame > 718 ? "••••••••" : ""}</div>
          <div style={{ padding: 18, textAlign: "center", background: c.tape, color: "#fff", borderRadius: 10, fontSize: 30, fontWeight: 800 }}>Entrar</div>
        </div>
        <Pending what="login de la app" />
      </div>
    );
  }
  const suspended = frame >= ev.suspend + 8;
  return (
    <div style={{ position: "absolute", inset: 0, background: ui.bg, fontFamily: font.sans, color: ui.ink }}>
      <div style={{ height: 96, background: "#1E1B18", color: "#EDE8DF", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 36px" }}>
        <span style={{ fontSize: 34, fontWeight: 800 }}>Los Segfault</span>
        <span style={{ fontFamily: font.mono, fontSize: 40 }}>{clockText(frame)}</span>
      </div>
      <div style={{ display: "flex", height: SCREEN.h - 96 }}>
        <div style={{ width: 360, borderRight: `2px solid ${ui.line}`, padding: 24, boxSizing: "border-box" }}>
          {["A · Rutas en la sierra", "B · Bits gemelos", "C · Ajolote", "D · Torres", "E · Mercado", "F · Primos"].map((p, i) => (
            <div key={p} style={{ padding: "16px 18px", fontSize: 26, borderRadius: 8, fontWeight: i === 0 ? 800 : 400, background: i === 0 ? "#EAE5DC" : undefined }}>{p}</div>
          ))}
        </div>
        <div style={{ flex: 1, padding: 40 }}>
          <div style={{ fontSize: 48, fontWeight: 800, marginBottom: 20 }}>A · Rutas en la sierra</div>
          {[92, 100, 84, 96, 60].map((w, i) => <div key={i} style={{ height: 22, width: `${w}%`, background: "#E2DDD4", borderRadius: 6, marginBottom: 18 }} />)}
          <div style={{ fontFamily: font.mono, fontSize: 24, color: ui.dim, marginTop: 30 }}>1 s · 256 MB · C, C++, Java, Python, JavaScript, C#</div>
        </div>
      </div>
      <div style={{ position: "absolute", left: btn.x, top: btn.y, translate: "-50% -50%", padding: "22px 40px", background: c.tape, color: "#fff", borderRadius: 12, fontSize: 32, fontWeight: 800, whiteSpace: "nowrap" }}>Enviar solución</div>
      <Cursor path={[[910, btn.x - 300, btn.y - 220], [940, btn.x, btn.y], [1395, btn.x - 260, btn.y - 200], [1410, btn.x, btn.y]]} clicks={[ev.submitWA, ev.submitAC]} />
      <Toast f={ev.verdictWA} text="Wrong Answer" color={c.bad} />
      <Toast f={ev.stampAC - 6} text="Accepted" color={c.ok} />
      {suspended && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(20,10,8,.82)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.stencil, fontSize: 120 }}>EQUIPO SUSPENDIDO</div>
      )}
      <Pending what="app de escritorio" />
    </div>
  );
};

// Panel del staff: reloj del concurso + aclaraciones.
export const StaffPanel: React.FC = () => {
  const frame = useCurrentFrame();
  const running = frame >= ev.clockStart;
  const reply = "Sí, N puede ser 0.".slice(0, Math.max(0, Math.floor((frame - 1255) / 1.5)));
  return (
    <Shell nav="Concurso" title="Concurso · Edición 2026">
      <div style={{ display: "flex", gap: 32 }}>
        <div style={{ width: 520, padding: 32, background: "#fff", border: `2px solid ${ui.line}`, borderRadius: 14 }}>
          <div style={{ fontSize: 24, color: ui.dim }}>Tiempo restante</div>
          <div style={{ fontFamily: font.mono, fontSize: 84, fontWeight: 700 }}>{clockText(frame)}</div>
          <div style={{ marginTop: 22, padding: "18px 0", textAlign: "center", borderRadius: 10, fontSize: 30, fontWeight: 800, background: running ? "#E3EFE7" : ui.ink, color: running ? c.ok : "#fff" }}>
            {running ? "● En curso" : "Iniciar"}
          </div>
        </div>
        <div style={{ flex: 1, padding: 28, background: "#fff", border: `2px solid ${ui.line}`, borderRadius: 14, fontSize: 26 }}>
          <div style={{ fontWeight: 800, fontSize: 30, marginBottom: 16 }}>Aclaraciones</div>
          {frame >= ev.question[1] && (
            <div style={{ padding: 18, background: "#FFF6E0", borderRadius: 10, marginBottom: 14 }}>
              <b>Los Segfault · A</b><div>¿N puede ser 0?</div>
              {reply && <div style={{ marginTop: 10, fontFamily: font.mono, color: c.ok }}>↳ {reply}</div>}
            </div>
          )}
          <div style={{ color: ui.dim }}>Off by One · C · ¿Hay saltos de línea al final?</div>
        </div>
      </div>
      <Cursor path={[[ev.clockStart - 25, 520, 640], [ev.clockStart - 6, 330, 520]]} clicks={[ev.clockStart - 3]} />
      <Pending what="panel del concurso" />
    </Shell>
  );
};

// Anti-trampas: latidos de los equipos y la alerta USB.
export const GuardScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const btn = { x: SCREEN.w / 2 + SUSPEND.x, y: SCREEN.h / 2 + SUSPEND.y };
  const teams = ["Null Pointers", "Off by One", "Bit a Bit", "Quetzal Greedy"];
  const alert = frame >= ev.alert;
  const done = frame >= ev.suspend + 4;
  return (
    <Shell nav="Anti-trampas" title="Anti-trampas">
      {alert && (
        <div style={{ padding: "20px 26px", marginBottom: 16, background: "#FBE3E1", border: `3px solid ${c.bad}`, borderRadius: 12, fontSize: 30, display: "flex", justifyContent: "space-between", opacity: ramp(frame, [ev.alert, ev.alert + 6], [0, 1]) }}>
          <span><b>Los Segfault</b> · USB conectada (E:\)</span>
          <span style={{ fontFamily: font.mono, color: c.bad }}>♥ hace 2 s</span>
        </div>
      )}
      {teams.map((t) => (
        <div key={t} style={{ padding: "16px 26px", borderBottom: `2px solid ${ui.line}`, fontSize: 28, display: "flex", justifyContent: "space-between" }}>
          <span>{t}</span>
          <span style={{ fontFamily: font.mono, color: c.ok, opacity: 0.5 + 0.5 * Math.abs(Math.sin(frame / 9 + t.length)) }}>♥ en línea</span>
        </div>
      ))}
      {alert && (
        <div style={{ position: "absolute", left: btn.x - 300, top: btn.y, translate: "-50% -50%", padding: "22px 44px", background: done ? ui.dim : c.bad, color: "#fff", borderRadius: 12, fontSize: 32, fontWeight: 800 }}>
          {done ? "Suspendido" : "Suspender"}
        </div>
      )}
      <Cursor path={[[1860, btn.x - 600, btn.y - 300], [1895, btn.x - 300, btn.y]]} clicks={[ev.suspend]} />
      <Pending what="anti-trampas" />
    </Shell>
  );
};

// Marcador (caja del marcador y proyector).
const TEAMS = [
  { name: "Null Pointers", solved: 3, pen: 141 },
  { name: "Off by One", solved: 3, pen: 188 },
  { name: "Bit a Bit", solved: 3, pen: 199 },
  { name: "Los Segfault", solved: 3, pen: 205 },
  { name: "Quetzal Greedy", solved: 2, pen: 99 },
  { name: "Ajolote Recursivo", solved: 1, pen: 41 },
];

export const Board: React.FC<{ projector?: boolean }> = ({ projector }) => {
  const frame = useCurrentFrame();
  const climb = ramp(frame, ev.climb, [0, 1], Easing.inOut(Easing.cubic));
  const solvedA = frame >= ev.climb[0];
  const order = (i: number) => {
    if (i === 3) return 3 - 3 * climb; // Los Segfault sube al 1.º
    return i < 3 ? i + climb : i;
  };
  const reveal = projector && frame >= ev.unfreeze;
  return (
    <div style={{ position: "absolute", inset: 0, background: projector ? "#120F0B" : ui.bg, color: projector ? "#EDE8DF" : ui.ink, fontFamily: font.sans }}>
      <div style={{ height: 130, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 44px" }}>
        <span style={{ fontFamily: font.stencil, fontSize: 64 }}>MARCADOR</span>
        <span style={{ fontFamily: font.mono, fontSize: 56 }}>{clockText(frame)}</span>
      </div>
      {TEAMS.map((t, i) => {
        const me = i === 3;
        const pos = order(i);
        return (
          <div
            key={t.name}
            style={{
              position: "absolute", left: 30, right: 30, top: 130 + pos * ROW_H, height: ROW_H - 10, display: "flex", alignItems: "center", gap: 24, padding: "0 24px",
              borderRadius: 10, fontSize: 36, zIndex: me ? 2 : 1,
              background: me ? (reveal ? "#E8B400" : projector ? "#2A241D" : "#FFF6E0") : projector ? "#1C1914" : "#fff",
              color: me && reveal ? "#141210" : undefined,
              boxShadow: me && climb > 0 && climb < 1 ? "0 16px 30px rgba(0,0,0,.3)" : undefined,
              scale: me && reveal ? ramp(frame, [ev.unfreeze + 10, ev.unfreeze + 25], [1, 1.04]) : 1,
            }}
          >
            <span style={{ fontFamily: font.mono, width: 50 }}>{Math.round(pos) + 1}</span>
            <span style={{ flex: 1, fontWeight: 800 }}>{t.name}{me && reveal ? "  🏆" : ""}</span>
            {me && (
              <span style={{ fontFamily: font.mono, fontSize: 30, padding: "6px 14px", borderRadius: 8, color: "#fff", background: solvedA ? c.ok : frame >= ev.verdictWA ? c.bad : "#999" }}>
                A {solvedA ? "+1" : frame >= ev.verdictWA ? "−1" : "·"}
              </span>
            )}
            <span style={{ fontFamily: font.mono, width: 100, textAlign: "right" }}>{t.solved + (me && solvedA ? 1 : 0)}</span>
            <span style={{ fontFamily: font.mono, width: 120, textAlign: "right", opacity: 0.7 }}>{t.pen + (me && solvedA ? 46 : 0)}</span>
          </div>
        );
      })}
      <Pending what={projector ? "proyector" : "marcador"} />
    </div>
  );
};
