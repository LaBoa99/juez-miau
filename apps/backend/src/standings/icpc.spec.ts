import { SubmissionStatus, Verdict } from '@concurso/shared-types'
import { computeStandings, type StandingsInput, type StandingsSubmission } from './icpc.js'

const minute = (m: number) => m * 60_000 + 30_000

let nextId = 1
const sub = (team: number, problem: number, verdict: Verdict | null, contestMinute: number, status = SubmissionStatus.DONE): StandingsSubmission =>
    ({ id: nextId++, team_id: team, problem_id: problem, status, verdict, contest_ms: minute(contestMinute) })

const base = (submissions: StandingsSubmission[]): StandingsInput => ({
    categories: [{ id: 1, code: 'PRIN', name: 'Principiantes' }, { id: 2, code: 'AVAN', name: 'Avanzados' }],
    teams: [
        { id: 10, name: 'Alfa', category_id: 1 },
        { id: 11, name: 'Beta', category_id: 1 },
        { id: 12, name: 'Gama', category_id: 1 },
        { id: 20, name: 'Delta', category_id: 2 },
    ],
    problems: [
        { id: 100, letter: 'B', title: 'Dos', category_id: 1 },
        { id: 101, letter: 'A', title: 'Uno', category_id: 1 },
        { id: 200, letter: 'A', title: 'Otro', category_id: 2 },
    ],
    submissions,
})

describe('computeStandings (ICPC)', () => {
    it('la penalización (en décimas) no supera a quien resolvió más', () => {
        const input = base([
            // Alfa: 10 min; Beta: 5 min; Gama: dos resueltos en 50 min
            sub(10, 101, Verdict.AC, 10), sub(11, 101, Verdict.AC, 5),
            sub(12, 101, Verdict.AC, 20), sub(12, 100, Verdict.AC, 30),
        ])
        const [principiantes] = computeStandings({ ...input, penaltyTenths: new Map([[11, 13], [12, 20]]) }, null)
        expect(principiantes.rows.map((row) => [row.rank, row.teamName, row.solved, row.penalty])).toEqual([
            [1, 'Gama', 2, 2],
            [2, 'Alfa', 1, 0],
            [3, 'Beta', 1, 1.3],
        ])
    })

    it('ordena por resueltos; los rechazos no penalizan y lo posterior al AC no cuenta', () => {
        const [principiantes, avanzados] = computeStandings(base([
            // Alfa: A en el minuto 10 con un WA y un CE antes (solo el WA se muestra); luego un WA que no cuenta
            sub(10, 101, Verdict.WA, 3), sub(10, 101, Verdict.CE, 5), sub(10, 101, Verdict.AC, 10), sub(10, 101, Verdict.WA, 12),
            // Beta: A en 15 y B en 40; dos resueltos le gana a Alfa
            sub(11, 101, Verdict.AC, 15), sub(11, 100, Verdict.TLE, 30), sub(11, 100, Verdict.AC, 40),
            // Gama: solo rechazos
            sub(12, 100, Verdict.RE, 20),
            // De otra categoría: no aparece en Principiantes
            sub(20, 200, Verdict.AC, 1),
        ]), null)

        expect(principiantes.problems.map((problem) => problem.letter)).toEqual(['A', 'B'])
        expect(principiantes.rows.map((row) => [row.rank, row.teamName, row.solved, row.penalty])).toEqual([
            [1, 'Beta', 2, 0],
            [2, 'Alfa', 1, 0],
            [3, 'Gama', 0, 0],
        ])
        const alfaA = principiantes.rows[1].cells[0]
        expect(alfaA).toEqual({ problemId: 101, solved: true, rejected: 1, acMinute: 10, firstToSolve: true, pending: 0 })
        expect(principiantes.rows[2].cells[1]).toMatchObject({ solved: false, rejected: 1 })
        expect(avanzados.rows).toEqual([expect.objectContaining({ teamName: 'Delta', rank: 1, solved: 1 })])
    })

    it('con los mismos resueltos, un solo intento de trampa (0.3) pesa más que el tiempo', () => {
        const input = base([sub(10, 101, Verdict.AC, 5), sub(11, 101, Verdict.WA, 10), sub(11, 101, Verdict.AC, 50)])
        const [principiantes] = computeStandings({ ...input, penaltyTenths: new Map([[10, 3]]) }, null)
        expect(principiantes.rows.map((row) => [row.rank, row.teamName, row.penalty])).toEqual([[1, 'Beta', 0], [2, 'Alfa', 0.3], [3, 'Gama', 0]])
    })

    it('desempata por el último AC más temprano y comparte lugar en empate exacto', () => {
        const [principiantes] = computeStandings(base([
            // Alfa: último AC en 50
            sub(10, 101, Verdict.AC, 10), sub(10, 100, Verdict.AC, 50),
            // Beta: último AC en 30 → gana el desempate
            sub(11, 101, Verdict.AC, 30), sub(11, 100, Verdict.AC, 30),
            // Gama: idéntico a Alfa → mismo lugar
            sub(12, 101, Verdict.AC, 10), sub(12, 100, Verdict.AC, 50),
        ]), null)

        expect(principiantes.rows.map((row) => [row.rank, row.teamName, row.lastAcMinute])).toEqual([[1, 'Beta', 30], [2, 'Alfa', 50], [2, 'Gama', 50]])
    })

    it('los suspendidos van al final, sin lugar, y no le quitan lugares a los demás', () => {
        const input = base([sub(10, 101, Verdict.AC, 5), sub(10, 100, Verdict.AC, 6), sub(11, 101, Verdict.AC, 20)])
        input.teams[0].suspended = true
        const [principiantes] = computeStandings(input, null)
        expect(principiantes.rows.map((row) => [row.rank, row.teamName, row.suspended, row.solved])).toEqual([
            [1, 'Beta', false, 1],
            [2, 'Gama', false, 0],
            [null, 'Alfa', true, 2],
        ])
    })

    it('congelado: lo enviado desde el congelamiento queda pendiente', () => {
        const submissions = [sub(10, 101, Verdict.WA, 50), sub(10, 101, Verdict.AC, 95), sub(11, 101, null, 20, SubmissionStatus.QUEUED)]

        const [frozen] = computeStandings(base(submissions), 90 * 60_000)
        const alfa = frozen.rows.find((row) => row.teamName === 'Alfa')!
        expect(alfa.cells[0]).toMatchObject({ solved: false, rejected: 1, pending: 1 })
        // En cola cuenta como pendiente aunque no esté congelado
        expect(frozen.rows.find((row) => row.teamName === 'Beta')!.cells[0].pending).toBe(1)

        const [staff] = computeStandings(base(submissions), null)
        expect(staff.rows.find((row) => row.teamName === 'Alfa')!).toMatchObject({ solved: 1, penalty: 0 })
    })
})
