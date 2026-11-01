import { ITeamImportCredential, TEAM_LOGIN_INSTRUCTIONS } from '@concurso/shared-types';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

// Logo servido desde packages/shared-types/src/assets (ver angular.json). Si falta, el PDF usa
// solo el texto del encabezado y se avisa (logoMissing).
const LOGO_URL = '/assets/logos/logo-cuvalles.png';

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_URL);
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

function teamPage(c: ITeamImportCredential, logo: string | null, generatedAt: string): Content[] {
  const header: Content = logo
    ? { image: logo, width: 140, alignment: 'center', margin: [0, 0, 0, 12] }
    : { text: 'Centro Universitario de los Valles', bold: true, fontSize: 13, alignment: 'center', margin: [0, 0, 0, 12] };

  return [
    header,
    { text: 'Credenciales de acceso', fontSize: 18, bold: true, alignment: 'center', margin: [0, 0, 0, 16] },
    { text: c.teamName, fontSize: 14, alignment: 'center', margin: [0, 0, 0, 16] },
    {
      table: {
        widths: ['auto', '*'],
        body: [
          // Roboto: pdfmake en el navegador solo trae esa fuente en su vfs (Courier truena al generar)
          [{ text: 'Usuario', bold: true }, { text: c.username, characterSpacing: 0.5 }],
          [{ text: 'Contraseña', bold: true }, { text: c.password, characterSpacing: 0.5 }],
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 16],
    },
    { text: 'Indicaciones', bold: true, margin: [0, 0, 0, 4] },
    { ul: [...TEAM_LOGIN_INSTRUCTIONS], margin: [0, 0, 0, 16] },
    { text: `Generado el ${generatedAt}`, fontSize: 9, color: '#666666', alignment: 'center' },
  ];
}

// Genera y descarga el PDF (una página por equipo). No guarda nada en disco del repo ni en storage.
export async function downloadCredentialsPdf(
  creds: ITeamImportCredential[],
  fileName: string,
): Promise<{ logoMissing: boolean }> {
  const [pdfMakeMod, vfsMod] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  const pdfMake = ((pdfMakeMod as unknown as { default?: unknown }).default ?? pdfMakeMod) as {
    vfs: unknown;
    fonts: unknown;
    createPdf: (doc: TDocumentDefinitions) => { download: (name: string) => void };
  };
  pdfMake.vfs = (vfsMod as unknown as { default?: unknown }).default ?? vfsMod;
  pdfMake.fonts = {
    Roboto: {
      normal: 'Roboto-Regular.ttf',
      bold: 'Roboto-Medium.ttf',
      italics: 'Roboto-Italic.ttf',
      bolditalics: 'Roboto-MediumItalic.ttf',
    },
  };

  const logo = await loadLogoDataUrl();
  const generatedAt = new Date().toLocaleString('es-MX');

  // Cada equipo en su propia página: un stack por equipo con salto antes (salvo el primero).
  const content: Content[] = creds.map((c, i) => ({
    stack: teamPage(c, logo, generatedAt),
    pageBreak: i > 0 ? 'before' : undefined,
  }));

  const doc: TDocumentDefinitions = { content, defaultStyle: { fontSize: 11 }, pageMargins: [48, 56, 48, 56] };
  pdfMake.createPdf(doc).download(fileName);

  return { logoMissing: logo === null };
}
