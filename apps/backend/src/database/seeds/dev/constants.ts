// Llaves naturales que comparten los seeders de dev para encontrarse entre sí
export const DEV_PASSWORD = 'dev12345'
export const DEMO_EDITION = 'Edición Demo'

export const DEMO_CATEGORIES = [
    { code: 'PRIN', name: 'Principiantes', sort_order: 1, room: 'Salón A' },
    { code: 'AVAN', name: 'Avanzados', sort_order: 2, room: 'Salón B' },
]

export const DEMO_STAFF = [
    { name: 'Juez Demo', email: 'juez@concurso.local', role: 'JUDGE' },
    { name: 'Observador Demo', email: 'observador@concurso.local', role: 'OBSERVER' },
] as const

export const TEAMS_PER_CATEGORY = 6
export const MEMBERS_PER_TEAM = 3
