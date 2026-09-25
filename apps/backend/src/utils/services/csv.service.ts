import { BadRequestException, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';

export type CsvRow = Record<string, string>;

@Injectable()
export class CsvService {
  parse(buffer: Buffer): CsvRow[] {
    try {
      // Por defecto csv-parse rechaza filas con columnas de más o de menos
      return parse(buffer, {
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
