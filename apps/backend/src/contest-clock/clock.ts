import { EditionStatus, type IContestClock } from '@concurso/shared-types'
import type { Edition } from '../editions/entities/edition.entity.js'

export type ClockFields = Pick<Edition, 'id' | 'status' | 'duration_ms' | 'freeze_duration_ms' | 'started_at' | 'paused_at' | 'finished_at' | 'paused_total_ms'>

// Tiempo de concurso transcurrido: desde el inicio, sin las pausas, hasta ahora (o hasta la pausa
// en curso o el final). Nunca pasa de la duración
export function elapsedMs(edition: ClockFields, now = new Date()): number {
    if(!edition.started_at) return 0

    const end = edition.finished_at ?? edition.paused_at ?? now
    const elapsed = end.getTime() - edition.started_at.getTime() - edition.paused_total_ms
    return Math.min(Math.max(0, elapsed), edition.duration_ms)
}

export function remainingMs(edition: ClockFields, now = new Date()): number {
    return edition.duration_ms - elapsedMs(edition, now)
}

// Minuto en que se congela el marcador público
export function freezeStartMs(edition: ClockFields): number {
    return Math.max(0, edition.duration_ms - edition.freeze_duration_ms)
}

// Se descongela al terminar la edición
export function isFrozen(edition: ClockFields, now = new Date()): boolean {
    return edition.freeze_duration_ms > 0
        && edition.status !== EditionStatus.FINISHED
        && elapsedMs(edition, now) >= freezeStartMs(edition)
}

// Se aceptan envíos solo con el reloj corriendo y antes del final
export function acceptsSubmissions(edition: ClockFields, now = new Date()): boolean {
    return edition.status === EditionStatus.RUNNING && remainingMs(edition, now) > 0
}

export function toClockDto(edition: ClockFields, now = new Date()): IContestClock {
    return {
        editionId: edition.id,
        status: edition.status,
        elapsedMs: elapsedMs(edition, now),
        durationMs: edition.duration_ms,
        freezeDurationMs: edition.freeze_duration_ms,
        frozen: isFrozen(edition, now),
        serverTime: now.toISOString(),
    }
}
