// Secciones de la barra de una edición, en su orden actual. Fuente única para el panel y para el registro de
// navegación (la prueba de calor de la barra)
export const EDITION_SECTIONS = [
    { path: 'configuracion', label: 'Configuración' },
    { path: 'equipos', label: 'Equipos' },
    { path: 'problemas', label: 'Problemas' },
    { path: 'concurso', label: 'Concurso' },
    { path: 'envios', label: 'Envíos' },
    { path: 'marcador', label: 'Marcador' },
    { path: 'revision', label: 'Revisión' },
    { path: 'alertas', label: 'Alertas' },
    { path: 'aclaraciones', label: 'Aclaraciones' },
] as const

export type EditionSection = typeof EDITION_SECTIONS[number]['path']

// Un clic en la barra: de qué sección (null = entró a la edición) a cuál
export interface ICreateNavEvent {
    from: EditionSection | null
    to: EditionSection
}

// Rol con el que se navegó; superadmin aparte porque ve todo sin tener rol en la edición
export type NavRole = 'superadmin' | 'admin' | 'judge' | 'observer'

// Conteo agregado: cuántas veces se fue de `from` a `to` con ese rol
export interface INavCount {
    role: NavRole
    from: EditionSection | null
    to: EditionSection
    count: number
}
