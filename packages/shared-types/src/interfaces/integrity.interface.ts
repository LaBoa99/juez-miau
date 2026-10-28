// ─── Integridad (fase 7): alertas, heartbeat y auditoría ─────

export enum FlagType {
    // El equipo inició sesión en otra máquina
    SESSION_REPLACED = "SESSION_REPLACED",
    // El cliente reportó un proceso de Edition.forbidden_processes
    FORBIDDEN_PROCESS = "FORBIDDEN_PROCESS",
    // El cliente dejó de mandar heartbeat con el concurso corriendo
    HEARTBEAT_LOST = "HEARTBEAT_LOST",
    // Levantada a mano por el staff
    MANUAL = "MANUAL",
}

export interface IFlag {
    id: number
    editionId: number
    teamId: number
    type: FlagType
    details: string
    createdAt: Date
    resolvedAt: Date | null
    resolvedBy: number | null
    resolutionNote: string | null
}

export interface ICreateFlag {
    teamId: number
    details: string
}

export interface IResolveFlag {
    note?: string
}

// El cliente del concursante lo manda cada `nextHeartbeatMs`
export interface IHeartbeat {
    // Nombres de los procesos en ejecución (sin ruta)
    processes?: string[]
}

export interface IHeartbeatResponse {
    forbiddenProcesses: string[]
    nextHeartbeatMs: number
    // true si hay una alerta sin resolver y la edición bloquea envíos con alertas
    submissionsBlocked: boolean
}

export interface IAuditEntry {
    id: number
    staffUserId: number
    editionId: number | null
    method: string
    path: string
    statusCode: number
    // El cuerpo sin contraseñas, tokens ni código fuente, recortado
    body: Record<string, unknown> | null
    createdAt: Date
}
