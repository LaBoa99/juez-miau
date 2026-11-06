import { IStandingsRow } from '@concurso/shared-types';

const EMOJI = ['🏆', '🥈', '🥉'];

const sentSomething = (r: IStandingsRow) => r.cells.some((c) => c.solved || c.rejected > 0 || c.pending > 0);

// Lugar de podio (1, 2 o 3) o null: posición entre los equipos no suspendidos que ya enviaron algo, aunque todo
// haya fallado. Los empates se rompen con el orden que ya trae el marcador (último AC y nombre).
export function podium(row: IStandingsRow, rows: IStandingsRow[]): 1 | 2 | 3 | null {
  if (row.suspended || !sentSomething(row)) return null;
  const place = rows.filter((r) => !r.suspended && sentSomething(r)).indexOf(row) + 1;
  return place >= 1 && place <= 3 ? (place as 1 | 2 | 3) : null;
}

export const podiumEmoji = (place: 1 | 2 | 3 | null) => (place ? EMOJI[place - 1] : '');

// Confeti como el del video (cae con vaivén y giro). Respeta prefers-reduced-motion.
export function confetti(n = 150, ms = 6000): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['confetti-tape', 'gold', 'confetti-sticker', 'success', 'silver', 'confetti-kraft'].map((t) => `var(--oj-${t})`);
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:1000';
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div');
    const x = Math.random() * 100;
    const sway = (Math.random() - 0.5) * 160;
    const spin = (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 720);
    p.style.cssText = `position:absolute;top:-40px;left:${x}vw;width:${10 + Math.random() * 8}px;height:20px;background:${colors[i % colors.length]}`;
    p.animate(
      [
        { transform: 'translate(0,0) rotate(0) scaleY(1)', opacity: 1 },
        { transform: `translate(${sway / 2}px,55vh) rotate(${spin / 2}deg) scaleY(-1)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${sway}px,110vh) rotate(${spin}deg) scaleY(1)`, opacity: 0.6 },
      ],
      { duration: ms * (0.55 + Math.random() * 0.45), delay: Math.random() * ms * 0.35, easing: 'linear', fill: 'backwards' },
    );
    layer.append(p);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), ms * 1.4);
}
