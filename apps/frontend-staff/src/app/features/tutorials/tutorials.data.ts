import { StaffRole } from '@concurso/shared-types';

export interface Tutorial {
  id: string; // video en public/tutoriales/<id>.mp4 y portada <id>.jpg (los genera apps/video)
  group: string;
  title: string;
  summary: string;
  // Roles de edición que pueden hacer lo que enseña; vacío = solo superadmin. El superadmin ve todos.
  roles: StaffRole[];
}

const ALL = [StaffRole.ADMIN, StaffRole.JUDGE, StaffRole.OBSERVER];
const JUDGES = [StaffRole.ADMIN, StaffRole.JUDGE];
const ADMIN = [StaffRole.ADMIN];

// Los permisos copian los del backend (RequireEditionRole / SuperadminOnly en cada controlador).
export const TUTORIALS: Tutorial[] = [
  { id: 'crear-problema', group: 'Problemas', title: 'Crear un problema', summary: 'Datos y PDF, la solución oficial como función, casos, evaluación y construir.', roles: JUDGES },
  { id: 'probar-solucion', group: 'Problemas', title: 'Probar soluciones y programa completo', summary: 'Juzga otras soluciones antes de proponer y usa la categoría especial de programa completo.', roles: JUDGES },
  { id: 'casos-evaluacion', group: 'Problemas', title: 'Casos de prueba y evaluación', summary: 'Casos a mano, pegados, aleatorios o con generador; cómo se compara la salida y la revisión manual.', roles: JUDGES },
  // Aceptar, quitar y regresar a borrador solo los muestra la interfaz al admin de la edición (canDecide)
  { id: 'aprobar-problemas', group: 'Problemas', title: 'Aprobar y administrar problemas', summary: 'Decide qué entra al concurso, regresa a borrador con motivo, elimina y crea versiones nuevas.', roles: ADMIN },
  { id: 'marcador', group: 'Marcador y proyector', title: 'Marcador y proyector', summary: 'Lee el marcador, el congelamiento y abre el proyector para el público.', roles: ALL },
  { id: 'alertas', group: 'Durante el concurso', title: 'Alertas anti-trampas', summary: 'Revisa las alertas de los equipos y márcalas como atendidas.', roles: ALL },
  { id: 'envios', group: 'Durante el concurso', title: 'Envíos y revisión', summary: 'Sigue los envíos en vivo y revisa el código y los casos de un envío.', roles: JUDGES },
  // Pausar y finalizar solo los muestra la interfaz al superadmin (contest-control.ts, canStopContest)
  { id: 'control', group: 'Durante el concurso', title: 'Control del concurso', summary: 'Vigila el reloj y el juez automático; pausa, reanuda o finaliza el concurso.', roles: [] },
  { id: 'aclaraciones', group: 'Durante el concurso', title: 'Aclaraciones', summary: 'Responde las preguntas de los equipos; la respuesta la ve toda la categoría.', roles: JUDGES },
  { id: 'edicion', group: 'Organizar el concurso', title: 'Configurar la edición', summary: 'Categorías, salones, lenguajes y el staff de la edición.', roles: ADMIN },
  { id: 'equipos', group: 'Organizar el concurso', title: 'Equipos', summary: 'Da de alta equipos uno por uno o impórtalos de un archivo.', roles: ADMIN },
  { id: 'programar', group: 'Organizar el concurso', title: 'Programar e iniciar el concurso', summary: 'Revisa los requisitos, programa la fecha y arranca el concurso.', roles: ADMIN },
  { id: 'superadmin', group: 'Superadmin', title: 'Ediciones, usuarios y lenguajes', summary: 'Crea ediciones, da de alta a los usuarios, administra lenguajes y consulta la auditoría.', roles: [] },
];

// Tutoriales que puede ver un usuario: los de sus roles en cualquier edición (todos si es superadmin).
export function tutorialsFor(isSuperadmin: boolean, roles: Iterable<StaffRole>): Tutorial[] {
  if (isSuperadmin) return TUTORIALS;
  const mine = new Set(roles);
  return TUTORIALS.filter((t) => t.roles.some((r) => mine.has(r)));
}
