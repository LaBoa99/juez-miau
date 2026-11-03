import { ISubmissionCase, Verdict } from '@concurso/shared-types';
import { judgeMessage } from '../../../core/http/backend-error.mapper';

export interface CaseReason {
  // Frase principal en español
  text: string;
  // Resumen corto (primeras líneas del error o del compilador); null si no hay
  detail: string | null;
}

export interface CaseLimits {
  timeLimitMs: number;
  memoryLimitMb: number;
}

const SUMMARY_LINES = 3;

// Motivo de un caso que no es AC. `limits` sale del testset del envío (puede no haber cargado aún).
export function caseReason(c: ISubmissionCase, limits: CaseLimits | null): CaseReason {
  switch (c.verdict) {
    case Verdict.TLE: {
      if (!limits) return unavailable(c.verdict);
      // El límite puede romperse por CPU o por tiempo real; se muestra el que lo excedió
      const used = c.cpuMs >= limits.timeLimitMs ? c.cpuMs : c.wallMs;
      return { text: `Tiempo límite excedido: usó ${used} ms de ${limits.timeLimitMs} ms permitidos.`, detail: null };
    }
    case Verdict.MLE: {
      if (!limits) return unavailable(c.verdict);
      const mb = Math.round((c.memoryKb / 1024) * 10) / 10;
      return { text: `Memoria excedida: usó ${mb} MB de ${limits.memoryLimitMb} MB permitidos.`, detail: null };
    }
    case Verdict.WA:
      // Sin message es la comparación normal; con message es un texto fijo del juez
      return {
        text: 'La salida no coincide con la esperada.',
        detail: c.message ? (judgeMessage(c.message) ?? null) : null,
      };
    case Verdict.RE: {
      const summary = c.message ? errorSummary(c.message) : null;
      const code = c.exitCode != null ? `Código de salida ${c.exitCode}.` : null;
      if (!summary && !code) return { text: 'El programa terminó con error.', detail: null };
      return { text: 'El programa terminó con error.', detail: summary ?? code };
    }
    default:
      return unavailable(c.verdict);
  }
}

// CE es del envío completo: primera línea del compilador que menciona un error (con su línea)
export function compileReason(compileLog: string | null): CaseReason {
  if (!compileLog?.trim()) return unavailable(Verdict.CE);
  const lines = compileLog.split('\n').map((l) => l.trim()).filter(Boolean);
  return { text: 'El código no compila.', detail: lines.find((l) => /error/i.test(l)) ?? lines[0] };
}

// Índice (0-based) de la primera línea distinta; null si son iguales
export function firstDiffLine(expected: string, actual: string): number | null {
  const a = expected.split('\n');
  const b = actual.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return i;
  }
  return null;
}

function unavailable(verdict: Verdict): CaseReason {
  return { text: `Motivo no disponible · ${verdict}`, detail: null };
}

// Resumen sin stack trace: en Python la excepción es la última línea; en los demás se quitan
// las líneas de pila ("at ...") y se dejan las primeras
function errorSummary(text: string): string | null {
  const lines = text.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
  if (!lines.length) return null;
  if (lines[0].startsWith('Traceback')) return lines[lines.length - 1];
  return lines.filter((l) => !/^\s*at\s/.test(l)).slice(0, SUMMARY_LINES).join('\n');
}
