import { BadRequestException, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';

export type CsvRow = Record<string, string>;

const UTF8 = new TextDecoder('utf-8', { fatal: true });
const WINDOWS_1252 = new TextDecoder('windows-1252');

// Bytes 0x80-0x9F de Windows-1252 que no son el mismo código en Unicode (€, ‘, “, …): para deshacer el mojibake
const CP1252_BYTE = new Map(
  [...WINDOWS_1252.decode(Uint8Array.from({ length: 32 }, (_, i) => 0x80 + i))].map((char, i) => [char, 0x80 + i]),
);

// Un carácter de UTF-8 mal leído como Latin-1/Windows-1252: "Ã©" (é), "Ã±" (ñ), "Ã‘" (Ñ), "Â¿" (¿)
const MOJIBAKE = /[Â-ô][\u0080-¿ŒœŠšŸŽžƒˆ˜–—‘-‚“-„†-•…‰‹›€™]{1,3}/g;

// Solo se cambia la secuencia si sus bytes forman UTF-8 válido: el texto bueno (p. ej. "Ã" sola) no se toca
function fixMojibake(text: string): string {
  return text.replace(MOJIBAKE, (sequence) => {
    const bytes = [...sequence].map((char) => CP1252_BYTE.get(char) ?? char.charCodeAt(0));
    if (bytes.some((byte) => byte > 0xff)) return sequence;
    try {
      return UTF8.decode(Uint8Array.from(bytes));
    } catch {
      return sequence;
    }
  });
}

// El CSV puede llegar en UTF-8 (lo correcto), en Windows-1252 (Excel en Windows) o con acentos doblemente
// codificados ("JosÃ©"). Lo que ya llegó como "�" no se puede recuperar: validateRows lo reporta
export function decodeCsvText(buffer: Buffer): string {
  let text: string;
  try {
    text = UTF8.decode(buffer);
  } catch {
    // No es UTF-8: Windows-1252. Si venía mezclado, lo que sí era UTF-8 queda como mojibake y se repara abajo
    text = WINDOWS_1252.decode(buffer);
  }
  // Doble mojibake (se guardó mal dos veces): una segunda pasada lo termina de deshacer
  return fixMojibake(fixMojibake(text));
}

@Injectable()
export class CsvService {
  parse(buffer: Buffer): CsvRow[] {
    try {
      // Por defecto csv-parse rechaza filas con columnas de más o de menos
      return parse(decodeCsvText(buffer), {
        columns: true, // usa la cabecera como llaves
        skip_empty_lines: true, // ignora líneas vacías
        bom: true, // quita el BOM que agrega Excel
        trim: true, // recorta espacios alrededor de cada valor
      });
    } catch (error) {
      throw new BadRequestException(
        `El archivo CSV está mal formado: ${(error as Error).message}`,
      );
    }
  }
}
