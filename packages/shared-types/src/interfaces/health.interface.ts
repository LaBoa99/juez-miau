// Healthcheck del backend (GET /health). Copia de IHealth del HealthController.
export interface IHealth {
    status: 'ok' | 'error'
    database: 'up' | 'down'
    redis: 'up' | 'down'
    // Informativo: un juez caído no tumba la API, pero los envíos se quedan en cola.
    judgeWorkers: number | null
    queuedSubmissions: number | null
}
