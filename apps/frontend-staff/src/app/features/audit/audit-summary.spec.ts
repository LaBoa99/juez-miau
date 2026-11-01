import { describe, expect, it } from 'vitest';
import { IAuditEntry } from '@concurso/shared-types';
import { auditResource, auditSummary } from './audit-summary';

function entry(method: string, path: string): IAuditEntry {
  return { id: 1, staffUserId: 1, editionId: null, method, path, statusCode: 200, body: null, createdAt: new Date() };
}

describe('audit-summary', () => {
  it('quita el prefijo /api/v1 del recurso', () => {
    expect(auditResource(entry('POST', '/api/v1/editions'))).toBe('/editions');
  });

  it('mapea rutas con id numérico', () => {
    expect(auditSummary(entry('POST', '/api/v1/editions/12/clock/pause'))).toBe('Pausó el concurso');
    expect(auditSummary(entry('POST', '/api/v1/flags/8/resolve'))).toBe('Resolvió una alerta');
  });

  it('interpola el id del envío', () => {
    expect(auditSummary(entry('POST', '/api/v1/submissions/1102/rejudge'))).toBe('Re-evaluó el envío #1102');
  });

  it('trata los uuid como id (lenguajes)', () => {
    expect(auditSummary(entry('PATCH', '/api/v1/languages/0f8fad5b-d9cb-469f-a165-70867728950e'))).toBe(
      'Editó un lenguaje',
    );
  });

  it('cae al método + ruta cuando no hay mapeo', () => {
    expect(auditSummary(entry('POST', '/api/v1/algo/nuevo'))).toBe('POST /algo/nuevo');
  });
});
