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

// Para imprimir barato: solo tinta negra, sin rellenos y con líneas delgadas
const THIN_LINES = { hLineWidth: () => 0.5, vLineWidth: () => 0.5 };

const DURING_CONTEST: readonly string[] = [
  'Elige un problema, programa tu solución en tu IDE y envíala desde la aplicación. El veredicto aparece en unos segundos.',
  'Puedes enviar las veces que quieras.',
  'Si algo del enunciado no está claro, pregunta en Aclaraciones dentro de la aplicación.',
];

// Ejemplos de lo que no se vale (sin decir cómo se revisa ni nombrar programas)
const FAIR_PLAY: readonly string[] = [
  'Buscar soluciones en internet o abrir un navegador.',
  'Usar asistentes de inteligencia artificial.',
  'Chatear o mandar mensajes.',
  'Compartir código o ideas con otros equipos.',
  'Usar memorias USB o teléfonos.',
];

// Los logos se pasan a escala de grises para que la hoja no gaste tinta de color
async function loadImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.filter = 'grayscale(1)';
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.toDataURL('image/png');
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

// Etiqueta (EQUIPO / STAFF) y nombre en grande, separados del resto con una línea
function nameHeading(label: string, name: string): Content {
  return {
    table: {
      widths: ['*'],
      body: [[{
        stack: [
          { text: label, fontSize: 10, bold: true, characterSpacing: 2 },
          { text: name, fontSize: 22, bold: true, margin: [0, 2, 0, 0] },
        ],
      }]],
    },
    layout: {
      hLineWidth: (i) => (i === 1 ? 1 : 0),
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 6,
    },
    margin: [0, 0, 0, 10],
  };
}

// Caja con un dato grande (categoría, salón)
function bigBox(label: string, value: string, note: string | null): Content {
  return {
    table: {
      widths: ['*'],
      body: [[{
        stack: [
          { text: label, fontSize: 9, bold: true, characterSpacing: 1.5 },
          { text: value, fontSize: 20, bold: true, margin: [0, 2, 0, 0] },
          ...(note ? [{ text: note, fontSize: 9 }] : []),
        ],
        margin: [12, 6, 12, 8],
      }]],
    },
    layout: THIN_LINES,
  };
}

// Usuario y contraseña grandes y espaciados, para copiarlos sin confundir letras
function credentials(userLabel: string, user: string, password: string): Content {
  const value = (text: string): Content => ({ text, fontSize: 16, bold: true, characterSpacing: 1.5 });
  return {
    table: {
      widths: ['auto', '*'],
      body: [
        [{ text: userLabel, margin: [0, 4, 0, 0] }, value(user)],
        [{ text: 'Contraseña', margin: [0, 4, 0, 0] }, value(password)],
      ],
    },
    layout: { ...THIN_LINES, paddingLeft: () => 12, paddingRight: () => 12, paddingTop: () => 6, paddingBottom: () => 6 },
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
      { stack: [{ text: kind, bold: true, fontSize: 10, alignment: 'right' }, { text: edition, fontSize: 10, alignment: 'right' }] },
    ],
    margin: [0, 0, 0, 8],
  };
}

function teamPage(t: TeamCredentialPage, logo: string | null, miau: string | null, edition: string): Content[] {
  return [
    header(logo, edition, 'Credencial de equipo'),
    nameHeading('EQUIPO', t.teamName),
    {
      columns: [
        bigBox('CATEGORÍA', t.category ?? 'Sin categoría', null),
        bigBox('SALÓN', t.room ?? 'Por asignar', t.room ? null : 'Pregunta al staff dónde sentarte'),
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
          columns: [
            {
              width: '*',
              stack: [
                { text: 'Juego limpio', bold: true, fontSize: 12, margin: [0, 0, 0, 3] },
                { text: 'Las soluciones deben ser trabajo de tu equipo. No está permitido:', margin: [0, 0, 0, 3] },
                { ul: [...FAIR_PLAY] },
                { text: 'Si tienes dudas sobre lo permitido, pregunta al staff antes de hacerlo.', italics: true, margin: [0, 4, 0, 0] },
              ],
            },
            ...(miau ? [{ image: miau, width: 72 }] : []),
          ],
          columnGap: 12,
          margin: [12, 6, 12, 8],
        }]],
      },
      layout: THIN_LINES,
    },
  ];
}

function staffPage(s: StaffCredentialPage, logo: string | null, panelUrl: string, instructions: readonly string[]): Content[] {
  return [
    header(logo, 'Panel de staff', 'Credencial de staff'),
    nameHeading('STAFF · PERSONAL DEL CONCURSO', s.name),
    { stack: [bigBox('PANEL DE STAFF', panelUrl, 'Entra desde el navegador; no es la aplicación de los equipos')], margin: [0, 0, 0, 10] },
    credentials('Correo', s.email, s.password),
    ...section('Indicaciones', instructions),
    {
      text: 'Esta hoja es personal: no la dejes en los lugares de los equipos.',
      bold: true,
      margin: [0, 4, 0, 0],
    },
  ];
}

async function build(pages: Content[][], fileName: string): Promise<void> {
  const pdfMake = await loadPdfMake();
  const generatedAt = new Date().toLocaleString('es-MX');
  const doc: TDocumentDefinitions = {
    pageSize: 'LETTER',
    pageMargins: [44, 36, 44, 44],
    // Cada credencial en su propia página
    content: pages.map((stack, i) => ({ stack, pageBreak: i > 0 ? 'before' : undefined })),
    footer: () => ({ text: `Generado el ${generatedAt}`, fontSize: 8, margin: [44, 16, 0, 0] }),
    defaultStyle: { fontSize: 10, lineHeight: 1.15 },
  };
  pdfMake.createPdf(doc).download(fileName);
}

// Equipos: con el logo de Juez Miau dentro del recuadro de reglas
export async function downloadTeamCredentialsPdf(teams: TeamCredentialPage[], fileName: string, edition: string): Promise<{ logoMissing: boolean }> {
  const [logo, miau] = await Promise.all([loadImage(CUVALLES_LOGO), loadImage(MIAU_LOGO)]);
  await build(teams.map((t) => teamPage(t, logo, miau, edition)), fileName);
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
