// Catálogo de programas no permitidos durante el concurso.
//
// NOTA: estos nombres de proceso deben CONFIRMARSE en las computadoras del concurso; los ejecutables
// reales pueden variar por versión/sistema. El backend (integrity.service.normalizeProcessName)
// compara quitando ruta, pasando a minúsculas y quitando ".exe", y exige coincidencia EXACTA
// (no "contiene"). Por eso aquí se guardan nombres base en minúsculas, sin ruta ni ".exe".

export interface ForbiddenProcessOption {
  id: string;
  etiqueta: string;
  procesos: string[];
}

export interface ForbiddenProcessGroup {
  grupo: string;
  opciones: ForbiddenProcessOption[];
}

export const FORBIDDEN_PROCESS_CATALOG: ForbiddenProcessGroup[] = [
  {
    grupo: 'Navegadores',
    opciones: [
      { id: 'chrome', etiqueta: 'Google Chrome', procesos: ['chrome'] },
      { id: 'firefox', etiqueta: 'Mozilla Firefox', procesos: ['firefox'] },
      { id: 'edge', etiqueta: 'Microsoft Edge', procesos: ['msedge'] },
      { id: 'brave', etiqueta: 'Brave', procesos: ['brave'] },
      { id: 'opera', etiqueta: 'Opera', procesos: ['opera', 'opera_gx'] },
    ],
  },
  {
    grupo: 'Mensajería',
    opciones: [
      { id: 'discord', etiqueta: 'Discord', procesos: ['discord'] },
      { id: 'whatsapp', etiqueta: 'WhatsApp', procesos: ['whatsapp'] },
      { id: 'telegram', etiqueta: 'Telegram', procesos: ['telegram'] },
      { id: 'slack', etiqueta: 'Slack', procesos: ['slack'] },
    ],
  },
  {
    grupo: 'Asistentes de IA',
    opciones: [
      { id: 'chatgpt', etiqueta: 'ChatGPT', procesos: ['chatgpt'] },
      { id: 'copilot', etiqueta: 'GitHub Copilot', procesos: ['copilot'] },
      { id: 'claude', etiqueta: 'Claude', procesos: ['claude'] },
    ],
  },
  {
    grupo: 'Acceso remoto',
    opciones: [
      { id: 'anydesk', etiqueta: 'AnyDesk', procesos: ['anydesk'] },
      { id: 'teamviewer', etiqueta: 'TeamViewer', procesos: ['teamviewer'] },
      { id: 'rustdesk', etiqueta: 'RustDesk', procesos: ['rustdesk'] },
    ],
  },
];

// Mismo criterio que el backend (integrity.service.normalizeProcessName).
export function normalizeProcessName(name: string): string {
  return name.trim().split(/[\\/]/).pop()!.toLowerCase().replace(/\.exe$/, '');
}

export interface ForbiddenSelection {
  selected: Set<string>; // ids de opciones marcadas
  otros: string[]; // procesos fuera del catálogo (texto original)
}

// Cruza forbidden_processes con el catálogo: una opción queda marcada si todos sus procesos están.
export function matchForbidden(forbidden: string[]): ForbiddenSelection {
  const present = new Set(forbidden.map(normalizeProcessName).filter(Boolean));
  const selected = new Set<string>();
  const covered = new Set<string>();

  for (const group of FORBIDDEN_PROCESS_CATALOG) {
    for (const opt of group.opciones) {
      if (opt.procesos.length && opt.procesos.every((p) => present.has(normalizeProcessName(p)))) {
        selected.add(opt.id);
        opt.procesos.forEach((p) => covered.add(normalizeProcessName(p)));
      }
    }
  }

  const seen = new Set<string>();
  const otros: string[] = [];
  for (const raw of forbidden) {
    const n = normalizeProcessName(raw);
    if (!n || covered.has(n) || seen.has(n)) continue;
    seen.add(n);
    otros.push(raw.trim());
  }

  return { selected, otros };
}

// Programas prohibidos = opciones marcadas + procesos "Otros".
export function countPrograms(forbidden: string[]): number {
  const { selected, otros } = matchForbidden(forbidden);
  return selected.size + otros.length;
}
