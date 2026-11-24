// Cada 10 s: un programa prohibido aparece en Alertas a lo mucho 10 s después de abrirse
export const HEARTBEAT_EVERY_MS = 10_000
// Respaldo si se corta la red sin cerrar el socket: tres heartbeats perdidos y un margen
export const HEARTBEAT_LOST_AFTER_MS = 35_000
// Tras caerse el socket: más que un heartbeat, para distinguir una app cerrada de una reconexión
export const DISCONNECT_GRACE_MS = 12_000
