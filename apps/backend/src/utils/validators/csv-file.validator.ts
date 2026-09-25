import { FileValidator } from '@nestjs/common';
import { extname } from 'path';

// Valida por extensión: un CSV es texto plano y no tiene "magic numbers",
// y el mimetype varía según el navegador/SO (p. ej. application/vnd.ms-excel).
// El contenido lo valida CsvService al parsearlo.
export class CsvFileValidator extends FileValidator {
  constructor() {
    super({});
  }

  isValid(file?: unknown): boolean {
    const name = (file as Express.Multer.File | undefined)?.originalname;
    return !!name && extname(name).toLowerCase() === '.csv';
  }

  buildErrorMessage(): string {
    return 'El archivo debe tener extensión .csv';
  }
}
