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
    // El equipo cerró sesión con el concurso en curso o en pausa
    SESSION_CLOSED = "SESSION_CLOSED",
}

// Decisión del juez sobre una alerta: solo la confirmada suma minutos en el marcador
export enum FlagOutcome {
    CONFIRMED = "CONFIRMED",
    DISMISSED = "DISMISSED",
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
    // null: abierta, o resuelta antes de que existiera esta decisión
    outcome: FlagOutcome | null
    // Número de falta de este tipo: 2 o más es reincidencia y frena los envíos mientras siga abierta
    offense: number
}

export interface ICreateFlag {
    teamId: number
    details: string
}

export interface IResolveFlag {
    outcome: FlagOutcome
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

// El catálogo completo de prohibidos y el bloqueo no se exponen al equipo. killProcesses es la
// excepción puntual: solo los nombres (normalizados) que YA están corriendo y coincidieron este
// heartbeat, para que el cliente los cierre; nunca el catálogo de lo que todavía no abrió.
export interface IHeartbeatResponse {
    nextHeartbeatMs: number
    killProcesses?: string[]
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
