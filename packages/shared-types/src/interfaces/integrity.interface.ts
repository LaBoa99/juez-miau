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
    // Más monitores que Edition.max_monitors
    EXTRA_MONITOR = "EXTRA_MONITOR",
    // Unidad de almacenamiento removible conectada (Edition.watch_usb_storage)
    USB_STORAGE = "USB_STORAGE",
    // Interfaz de red que no estaba al iniciar sesión (Edition.watch_network)
    NETWORK_CHANGE = "NETWORK_CHANGE",
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
    // Monitores conectados (se omite si el cliente no lo puede saber)
    monitors?: number
    // Unidades de almacenamiento removibles montadas
    usbStorage?: string[]
    // Interfaces de red activas (sin loopback)
    networkInterfaces?: string[]
}

// Solo el intervalo: la lista de prohibidos y el bloqueo no se exponen al equipo
export interface IHeartbeatResponse {
    nextHeartbeatMs: number
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
