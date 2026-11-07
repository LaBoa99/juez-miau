import { IAuditEntry } from '@concurso/shared-types';

// Convierte método + ruta en una frase legible en español. El backend guarda la ruta completa
// (con el prefijo /api/v1 y los ids), así que aquí se normaliza a un patrón: se quita el prefijo y
// cada id (numérico o uuid) se reemplaza por `#`. Si el patrón no está en el mapa, se muestra el
// método y la ruta tal cual. Las frases con número usan una función con los ids capturados.

type Phrase = string | ((ids: number[]) => string);

// shortcut: solo las mutaciones más comunes; una ruta no mapeada cae al método + ruta crudos.
const MAP: Record<string, Phrase> = {
  // Ediciones
  'POST /editions': 'Creó una edición',
  'PATCH /editions/#': 'Editó la edición',
  'POST /editions/#/schedule': 'Programó la edición',
  'DELETE /editions/#': 'Eliminó la edición',
  'PUT /editions/#/languages': 'Actualizó los lenguajes de la edición',
  'POST /editions/#/categories': 'Agregó una categoría a la edición',
  'POST /editions/#/rooms': 'Creó un salón',
  'POST /editions/#/staff': 'Agregó staff a la edición',
  'DELETE /editions/#/staff/#': 'Quitó staff de la edición',
  'POST /editions/#/teams/import/validate': 'Validó la importación de equipos',
  'POST /editions/#/teams/import': 'Importó equipos',

  // Reloj del concurso
  'POST /editions/#/clock/start': 'Inició el concurso',
  'POST /editions/#/clock/pause': 'Pausó el concurso',
  'POST /editions/#/clock/resume': 'Reanudó el concurso',
  'POST /editions/#/clock/finish': 'Finalizó el concurso',

  // Alertas
  'POST /editions/#/flags': 'Levantó una alerta',
  'POST /flags/#/resolve': 'Resolvió una alerta',

  // Categorías y salones
  'PATCH /categories/#': 'Editó una categoría',
  'DELETE /categories/#': 'Eliminó una categoría',
  'PATCH /rooms/#': 'Editó un salón',
  'DELETE /rooms/#': 'Eliminó un salón',
  'POST /rooms/#/observers': 'Asignó un observador a un salón',
  'DELETE /rooms/#/observers/#': 'Quitó un observador de un salón',
  'POST /rooms/#/board-token': 'Generó el token del proyector',
  'DELETE /rooms/#/board-token': 'Revocó el token del proyector',

  // Equipos
  'PATCH /teams/#': 'Editó un equipo',
  'POST /teams/#/reset-password': 'Restableció la contraseña de un equipo',
  'DELETE /teams/#': 'Eliminó un equipo',
  'DELETE /teams/#/sessions': 'Cerró la sesión de un equipo',

  // Problemas y casos de prueba
  'POST /editions/#/problems': 'Creó un problema',
  'PATCH /problems/#': 'Editó un problema',
  'POST /problems/#/publish': 'Publicó un problema',
  'POST /problems/#/propose': 'Propuso un problema',
  'POST /problems/#/accept': 'Aceptó un problema para el concurso',
  'POST /problems/#/disable': 'Sacó un problema del concurso',
  'DELETE /problems/#': 'Eliminó un problema',
  'PATCH /problems/#/signature': 'Actualizó la firma del problema',
  'POST /problems/#/testsets': 'Creó un conjunto de pruebas',
  'PATCH /testsets/#': 'Editó un conjunto de pruebas',
  'POST /testsets/#/generate': 'Generó casos de prueba',
  'PUT /testsets/#/ref-solution': 'Subió la solución de referencia',
  'PUT /testsets/#/checker': 'Configuró el verificador',
  'DELETE /testsets/#/checker': 'Quitó el verificador',
  'PUT /testsets/#/generator': 'Configuró el generador',
  'DELETE /testsets/#/generator': 'Quitó el generador',
  'POST /testsets/#/build': 'Construyó el conjunto de pruebas',
  'POST /testsets/#/cases': 'Agregó un caso de prueba',
  'PATCH /testsets/#/cases/#': 'Editó un caso de prueba',
  'DELETE /testsets/#/cases/#': 'Eliminó un caso de prueba',

  // Envíos
  'POST /submissions/#/rejudge': (ids) => `Re-evaluó el envío #${ids[0]}`,
  'POST /submissions/#/review': (ids) => `Revisó el envío #${ids[0]}`,
  'POST /problems/#/rejudge': 'Re-evaluó los envíos de un problema',

  // Staff y lenguajes
  'POST /staff': 'Creó un usuario de staff',
  'PATCH /staff/#': 'Editó un usuario de staff',
  'POST /staff/#/deactivate': 'Desactivó un usuario de staff',
  'POST /languages': 'Creó un lenguaje',
  'PATCH /languages/#': 'Editó un lenguaje',
};

// Ruta sin el prefijo /api/v1, para mostrarla y para construir el patrón.
export function auditResource(entry: IAuditEntry): string {
  return entry.path.replace(/^\/api\/v\d+/, '') || '/';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f-]+$/i;

export function auditSummary(entry: IAuditEntry): string {
  const ids: number[] = [];
  const pattern = auditResource(entry)
    .split('/')
    .map((seg) => {
      if (/^\d+$/.test(seg)) {
        ids.push(Number(seg));
        return '#';
      }
      return UUID.test(seg) ? '#' : seg;
    })
    .join('/');

  const phrase = MAP[`${entry.method} ${pattern}`];
  if (phrase === undefined) return `${entry.method} ${auditResource(entry)}`;
  return typeof phrase === 'function' ? phrase(ids) : phrase;
}
