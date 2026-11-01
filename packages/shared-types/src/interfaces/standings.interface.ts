// Marcador ICPC (decisión del 2026-10-27, docs/design/backend-roadmap.md):
// más problemas resueltos; luego menos penalización (minuto de cada AC + 20 por cada rechazo
// previo; CE no cuenta); luego el último AC más temprano. Empates exactos comparten lugar

export interface IStandingsCell {
    problemId: number
    solved: boolean
    // Rechazos (WA, TLE, MLE, RE) antes del AC, o todos si no lo ha resuelto
    rejected: number
    // Minuto de concurso del AC
    acMinute: number | null
    // Primer equipo de su categoría en resolverlo
    firstToSolve: boolean
    // Envíos sin veredicto visible: en cola, juzgándose, o después del congelamiento
    pending: number
}

export interface IStandingsRow {
    // null: equipo suspendido (va al final, sin lugar)
    rank: number | null
    suspended: boolean
    teamId: number
    teamName: string
    solved: number
    penalty: number
    cells: IStandingsCell[]
}

export interface IStandingsCategory {
    categoryId: number
    code: string
    name: string
    problems: { id: number, letter: string, title: string }[]
    rows: IStandingsRow[]
}

export interface IStandings {
    editionId: number
    // El staff está en las dos salas: con esto distingue cuál de los dos recibió por socket
    view: 'public' | 'staff'
    // true: los envíos desde el minuto `freezeMinute` aparecen como pendientes
    frozen: boolean
    freezeMinute: number | null
    generatedAt: string
    categories: IStandingsCategory[]
}
