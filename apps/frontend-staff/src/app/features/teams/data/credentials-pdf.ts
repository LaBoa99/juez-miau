import { TEAM_LOGIN_INSTRUCTIONS } from '@concurso/shared-types';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

// Logos servidos desde public/assets/logos. Si falta alguno, el PDF sale igual (sin esa imagen) y se avisa.
const CUVALLES_LOGO = '/assets/logos/logo-cuvalles.png';
const MIAU_LOGO = '/assets/logos/gatito-512.png';

// Una página por equipo. Categoría y salón van grandes: varias hojas iguales se confunden en el laboratorio
export interface TeamCredentialPage {
  teamName: string;
  username: string;
  password: string;
  category: string | null;
  room: string | null;
  members: string[];
}

export interface StaffCredentialPage {
  name: string;
  email: string;
  password: string;
}

// Colores del PDF (no son CSS del panel): azul para equipos, casi negro para staff, para distinguirlos de lejos
const TEAM = '#1D4ED8';
const STAFF = '#111827';
const MUTED = '#6B7280';
const BORDER = '#D1D5DB';

const DURING_CONTEST: readonly string[] = [
  'Elige un problema, escribe tu solución y envíala desde la aplicación; el veredicto aparece en unos segundos.',
  'Puedes enviar las veces que quieras. Cuenta el primer envío correcto, y cada envío incorrecto antes de él suma 20 minutos de penalización.',
  'Si algo del enunciado no está claro, pregunta en Aclaraciones dentro de la aplicación.',
];

// Ejemplos de lo que no se vale (sin decir cómo se revisa)
const FAIR_PLAY: readonly string[] = [
  'Buscar soluciones en internet o abrir un navegador.',
  'Usar asistentes de IA (ChatGPT, Copilot, Gemini…).',
  'Chatear o mandar mensajes (WhatsApp, Discord, correo).',
  'Compartir código o ideas con otros equipos.',
  'Usar memorias USB, teléfonos o un segundo monitor.',
];

async function loadImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function loadPdfMake() {
  const [pdfMakeMod, vfsMod] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  const pdfMake = ((pdfMakeMod as unknown as { default?: unknown }).default ?? pdfMakeMod) as {
    vfs: unknown;
    fonts: unknown;
    createPdf: (doc: TDocumentDefinitions) => { download: (name: string) => void };
  };
  pdfMake.vfs = (vfsMod as unknown as { default?: unknown }).default ?? vfsMod;
  // Roboto: pdfmake en el navegador solo trae esa fuente en su vfs (Courier truena al generar)
  pdfMake.fonts = {
    Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' },
  };
  return pdfMake;
}

// Franja de color con la etiqueta (EQUIPO / STAFF) y el nombre en grande
function band(color: string, label: string, title: string): Content {
  return {
    table: {
      widths: ['*'],
      body: [[{
        stack: [
          { text: label, fontSize: 10, bold: true, color: '#FFFFFF', characterSpacing: 2 },
          { text: title, fontSize: 22, bold: true, color: '#FFFFFF', margin: [0, 2, 0, 0] },
        ],
        fillColor: color,
        margin: [14, 8, 14, 10],
      }]],
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 10],
  };
}

// Caja con un dato grande (categoría, salón)
function bigBox(label: string, value: string, note: string | null, fill: string): Content {
  return {
    table: {
      widths: ['*'],
      body: [[{
        stack: [
          { text: label, fontSize: 9, bold: true, color: MUTED, characterSpacing: 1.5 },
          { text: value, fontSize: 20, bold: true, margin: [0, 2, 0, 0] },
          ...(note ? [{ text: note, fontSize: 9, color: MUTED }] : []),
        ],
        fillColor: fill,
        margin: [12, 6, 12, 8],
      }]],
    },
    layout: { hLineColor: () => BORDER, vLineColor: () => BORDER },
  };
}

// Usuario y contraseña grandes y espaciados, para copiarlos sin confundir letras
function credentials(userLabel: string, user: string, password: string): Content {
  const value = (text: string): Content => ({ text, fontSize: 16, bold: true, characterSpacing: 1.5 });
  return {
    table: {
      widths: ['auto', '*'],
      body: [
        [{ text: userLabel, color: MUTED, margin: [0, 4, 0, 0] }, value(user)],
        [{ text: 'Contraseña', color: MUTED, margin: [0, 4, 0, 0] }, value(password)],
      ],
    },
    layout: { hLineColor: () => BORDER, vLineColor: () => BORDER, paddingLeft: () => 12, paddingRight: () => 12, paddingTop: () => 6, paddingBottom: () => 6 },
    margin: [0, 0, 0, 10],
  };
}

function section(title: string, items: readonly string[], ordered = false): Content[] {
  return [
    { text: title, bold: true, fontSize: 11.5, margin: [0, 0, 0, 3] },
    ordered ? { ol: [...items], margin: [0, 0, 0, 9] } : { ul: [...items], margin: [0, 0, 0, 9] },
  ];
}

function header(logo: string | null, edition: string, kind: string): Content {
  return {
    columns: [
      logo ? { image: logo, width: 100 } : { text: 'Centro Universitario de los Valles', bold: true, fontSize: 11, width: 'auto' },
      { stack: [{ text: kind, bold: true, fontSize: 10, alignment: 'right' }, { text: edition, fontSize: 10, color: MUTED, alignment: 'right' }] },
    ],
    margin: [0, 0, 0, 8],
  };
}

function teamPage(t: TeamCredentialPage, logo: string | null, edition: string): Content[] {
  return [
    header(logo, edition, 'Credencial de equipo'),
    band(TEAM, 'EQUIPO', t.teamName),
    {
      columns: [
        bigBox('CATEGORÍA', t.category ?? 'Sin categoría', null, '#EFF6FF'),
        bigBox('SALÓN', t.room ?? 'Por asignar', t.room ? null : 'Pregunta al staff dónde sentarte', '#F0FDF4'),
      ],
      columnGap: 12,
      margin: [0, 0, 0, 10],
    },
    credentials('Usuario', t.username, t.password),
    ...(t.members.length ? [{ text: [{ text: 'Integrantes: ', bold: true }, t.members.join(', ')], margin: [0, 0, 0, 9] } as Content] : []),
    ...section('Cómo entrar', TEAM_LOGIN_INSTRUCTIONS, true),
    ...section('Durante el concurso', DURING_CONTEST),
    {
      table: {
        widths: ['*'],
        body: [[{
          stack: [
            { text: '¡Compite limpio!', bold: true, fontSize: 12, margin: [0, 0, 0, 3] },
            { text: 'Lo que envíen debe ser trabajo de su equipo. No se vale, por ejemplo:', margin: [0, 0, 0, 3] },
            { ul: [...FAIR_PLAY] },
            { text: 'Si tienes duda de si algo se vale, pregúntale al staff antes de hacerlo.', italics: true, margin: [0, 4, 0, 0] },
          ],
          fillColor: '#FFFBEB',
          margin: [12, 6, 12, 8],
        }]],
      },
      layout: { hLineColor: () => '#D97706', vLineColor: () => '#D97706' },
    },
  ];
}

function staffPage(s: StaffCredentialPage, logo: string | null, panelUrl: string, instructions: readonly string[]): Content[] {
  return [
    header(logo, 'Panel de staff', 'Credencial de staff'),
    band(STAFF, 'STAFF · PERSONAL DEL CONCURSO', s.name),
    { stack: [bigBox('PANEL DE STAFF', panelUrl, 'Entra desde el navegador; no es la aplicación de los equipos', '#F3F4F6')], margin: [0, 0, 0, 10] },
    credentials('Correo', s.email, s.password),
    ...section('Indicaciones', instructions),
    {
      text: 'Esta hoja es personal: no la dejes en los lugares de los equipos.',
      bold: true,
      margin: [0, 4, 0, 0],
    },
  ];
}

async function build(pages: Content[][], fileName: string, background?: TDocumentDefinitions['background']): Promise<void> {
  const pdfMake = await loadPdfMake();
  const generatedAt = new Date().toLocaleString('es-MX');
  const doc: TDocumentDefinitions = {
    pageSize: 'LETTER',
    // Abajo queda espacio para el logo de Juez Miau: no se encima en el contenido
    pageMargins: [44, 36, 44, 92],
    // Cada credencial en su propia página
    content: pages.map((stack, i) => ({ stack, pageBreak: i > 0 ? 'before' : undefined })),
    footer: () => ({ text: `Generado el ${generatedAt}`, fontSize: 8, color: MUTED, margin: [44, 52, 0, 0] }),
    background,
    defaultStyle: { fontSize: 10, lineHeight: 1.15 },
  };
  pdfMake.createPdf(doc).download(fileName);
}

// Equipos: con el logo de Juez Miau en la esquina inferior derecha de cada hoja
export async function downloadTeamCredentialsPdf(teams: TeamCredentialPage[], fileName: string, edition: string): Promise<{ logoMissing: boolean }> {
  const [logo, miau] = await Promise.all([loadImage(CUVALLES_LOGO), loadImage(MIAU_LOGO)]);
  const background: TDocumentDefinitions['background'] = (_page, size) =>
    miau ? { image: miau, width: 64, absolutePosition: { x: size.width - 64 - 36, y: size.height - 64 - 18 } } : null;
  await build(teams.map((t) => teamPage(t, logo, edition)), fileName, background);
  return { logoMissing: logo === null || miau === null };
}

export async function downloadStaffCredentialsPdf(
  staff: StaffCredentialPage[],
  fileName: string,
  panelUrl: string,
  instructions: readonly string[],
): Promise<{ logoMissing: boolean }> {
  const logo = await loadImage(CUVALLES_LOGO);
  await build(staff.map((s) => staffPage(s, logo, panelUrl, instructions)), fileName);
  return { logoMissing: logo === null };
}
