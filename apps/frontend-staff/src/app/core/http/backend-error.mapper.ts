// Traductor de errores del backend (NestJS) a español para la persona usuaria.
// Regla del proyecto: NUNCA se muestra en pantalla el texto crudo del backend ni valores
// técnicos en inglés. Si un mensaje no se reconoce, se usa un texto general según la acción
// y el original va SOLO a la consola.
//
// Los patrones salen de docs/backend-api.md (## problems, ## testsets, ## editions) y del
// código del backend (findPublishErrors, build, findScheduleErrors, conflictos comunes).

// Patrones conocidos, de más específico a más general. Cubren tanto los mensajes en inglés
// (publicar/construir/conflictos) como los que el backend ya manda en español (schedule).
const PATTERNS: readonly [RegExp, string][] = [
  // ── Publicar / construir testset ──
  [/without expected output/i, 'Hay casos sin salida esperada. Construye los casos de prueba para generarlas.'],
  [/is not built|not ready|is not (yet )?ready|status:\s*(draft|failed|building)/i, 'Los casos de prueba aún no se han construido.'],
  [/already being built/i, 'Los casos de prueba ya se están construyendo.'],
  [/no reference solution/i, 'Falta subir la solución oficial.'],
  [/has no public test cases/i, 'Falta marcar al menos un caso como público (ejemplo del enunciado).'],
  [/has no test cases/i, 'Falta agregar al menos un caso de prueba.'],
  [/no current testset/i, 'El problema no tiene una versión de casos de prueba vigente.'],
  [/(signature is not defined|has no signature|no signature)/i, 'Falta definir la firma de la función.'],
  [/statement is empty/i, 'El enunciado está vacío.'],
  [/inputformat is empty/i, 'El formato de entrada está vacío.'],
  [/outputformat is empty/i, 'El formato de salida está vacío.'],
  [/checker but .* has no checker|has no checker/i, 'La comparación es por checker pero falta subir el checker.'],
  // ── Firma / versiones ──
  [/signature .* can only change while it is a draft/i, 'La firma solo se puede cambiar mientras el problema es borrador.'],
  [/new version can only be created from a ready testset/i, 'Solo se puede crear una versión nueva desde una versión lista.'],
  [/reserved word/i, 'Un nombre usa una palabra reservada de algún lenguaje.'],
  [/duplicated parameter/i, 'Hay nombres de parámetro repetidos.'],
  [/at most 16 parameters/i, 'La firma admite como máximo 16 parámetros.'],
  [/must be an identifier/i, 'Un nombre no es válido: usa letras, dígitos y _ (hasta 64).'],
  // ── Problema / edición ──
  [/letter .* is already used/i, 'Esa letra ya está usada en la categoría.'],
  [/can only be deleted while it is a draft/i, 'Solo se puede eliminar mientras es borrador.'],
  [/can only be modified before it starts/i, 'Solo se puede modificar antes de que inicie el concurso.'],
  [/can only be deleted while it is a draft/i, 'Solo se puede eliminar mientras es borrador.'],
  // ── Programar edición (el backend ya los manda en español; se normalizan) ──
  [/problemas publicados|no published problems/i, 'Falta publicar al menos un problema.'],
  [/no tiene equipos|no teams/i, 'Falta registrar al menos un equipo.'],
  [/no tiene duración|duration/i, 'Falta definir la duración de la edición.'],
  [/usernames? repetidos|repeated|username/i, 'Hay usuarios repetidos en otra edición activa.'],
  [/scheduled_start must be in the future|fecha debe ser futura/i, 'La fecha de inicio debe ser futura.'],
  // ── Envíos / concurso ──
  [/contest is not running/i, 'El concurso no está en curso.'],
  [/language .* is not enabled|not enabled in this contest/i, 'El lenguaje no está habilitado en este concurso.'],
  [/blocked until the staff reviews an alert/i, 'Los envíos están bloqueados hasta que el staff revise una alerta del equipo.'],
  // ── Email / recursos ──
  [/email .* ya está registrado|already registered/i, 'Ese correo ya está registrado.'],
];

function translateOne(raw: string): string | null {
  for (const [re, es] of PATTERNS) {
    if (re.test(raw)) return es;
  }
  return null;
}

// Extrae los mensajes crudos de la respuesta de error de Nest: errors[] (422 de negocio),
// o message (string de un conflicto, o string[] de validación).
function rawMessages(err: unknown): string[] {
  const body = (err as { error?: { errors?: unknown; message?: unknown } } | undefined)?.error;
  if (Array.isArray(body?.errors)) return (body!.errors as unknown[]).map(String);
  if (Array.isArray(body?.message)) return (body!.message as unknown[]).map(String);
  if (typeof body?.message === 'string') return [body.message];
  return [];
}

// Mensajes reconocidos y traducidos; los no reconocidos se registran en consola (nunca en pantalla).
export function translatedMessages(err: unknown): string[] {
  const out: string[] = [];
  const untranslated: string[] = [];
  for (const raw of rawMessages(err)) {
    const es = translateOne(raw);
    if (es) {
      if (!out.includes(es)) out.push(es);
    } else {
      untranslated.push(raw);
    }
  }
  if (untranslated.length) console.warn('[backend] mensajes sin traducir:', untranslated, err);
  return out;
}

// Para los sitios con un solo string de error: devuelve lo reconocido (en español) o el
// texto general de la acción. Reemplaza a los antiguos helpers message()/messageOrErrors().
export function backendMessage(err: unknown, fallback: string): string {
  const m = translatedMessages(err);
  return m.length ? m.join(' · ') : fallback;
}

export interface TranslatedError {
  title: string;
  messages: string[];
}

// Para los sitios que muestran una lista con título (publicar, programar, construir).
export function translateBackendError(err: unknown, title: string, fallback: string): TranslatedError {
  const m = translatedMessages(err);
  return { title, messages: m.length ? m : [fallback] };
}
