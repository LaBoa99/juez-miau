import { EditionStatus } from '@concurso/shared-types'
import { acceptsSubmissions, elapsedMs, isFrozen, remainingMs, type ClockFields } from './clock.js'

const at = (minute: number) => new Date(Date.UTC(2026, 9, 27, 10, minute))

const edition = (fields: Partial<ClockFields>): ClockFields => ({
    id: 1,
    status: EditionStatus.RUNNING,
    duration_ms: 120 * 60_000,
    freeze_duration_ms: 30 * 60_000,
    started_at: at(0),
    paused_at: null,
    finished_at: null,
    paused_total_ms: 0,
    ...fields,
})

describe('reloj del concurso', () => {
    it('sin iniciar marca 0', () => {
        expect(elapsedMs(edition({ status: EditionStatus.SCHEDULED, started_at: null }), at(5))).toBe(0)
    })

    it('no cuenta las pausas terminadas ni la pausa en curso', () => {
        // 10 min de pausa ya terminada
        expect(elapsedMs(edition({ paused_total_ms: 10 * 60_000 }), at(40))).toBe(30 * 60_000)
        // Pausado en el minuto 50 (40 de concurso): el reloj no avanza aunque pase el tiempo
        const paused = edition({ status: EditionStatus.PAUSED, paused_total_ms: 10 * 60_000, paused_at: at(50) })
        expect(elapsedMs(paused, at(59))).toBe(40 * 60_000)
        expect(acceptsSubmissions(paused, at(59))).toBe(false)
    })

    it('nunca pasa de la duración y deja de aceptar envíos al final', () => {
        expect(elapsedMs(edition({}), at(200))).toBe(120 * 60_000)
        expect(remainingMs(edition({}), at(200))).toBe(0)
        expect(acceptsSubmissions(edition({}), at(119))).toBe(true)
        expect(acceptsSubmissions(edition({}), at(120))).toBe(false)
    })

    it('se congela en los últimos minutos y se descongela al terminar', () => {
        expect(isFrozen(edition({}), at(89))).toBe(false)
        expect(isFrozen(edition({}), at(90))).toBe(true)
        expect(isFrozen(edition({ status: EditionStatus.FINISHED, finished_at: at(120) }), at(121))).toBe(false)
        expect(isFrozen(edition({ freeze_duration_ms: 0 }), at(119))).toBe(false)
    })
})
