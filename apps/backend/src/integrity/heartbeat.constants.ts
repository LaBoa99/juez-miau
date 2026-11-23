// Cada 10 s: un programa prohibido aparece en Alertas a lo mucho 10 s después de abrirse
export const HEARTBEAT_EVERY_MS = 10_000
// 90 s sin heartbeat (nueve perdidos): un corte breve de red no levanta alerta
export const HEARTBEAT_LOST_AFTER_MS = 90_000
