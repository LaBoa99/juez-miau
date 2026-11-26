// Marcador (decisión del 2026-11-26, docs/design/evaluacion-alertas.md): más problemas resueltos;
// luego menos penalizaciones (alertas confirmadas); luego el último AC más temprano.
// Los rechazos no penalizan. Empates exactos comparten lugar

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
    // Para filtrar el marcador por salón
    roomId: number | null
    solved: number
    // Alertas de integridad confirmadas por un juez (no minutos)
    penalty: number
    // Minuto del último AC: desempata a igualdad de resueltos y penalizaciones; null si no ha resuelto nada
    lastAcMinute: number | null
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
