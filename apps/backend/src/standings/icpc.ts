import { SubmissionStatus, Verdict, type IStandingsCategory, type IStandingsCell, type IStandingsRow } from '@concurso/shared-types'

export const PENALTY_PER_REJECTION = 20

// Rechazos que suman penalización; CE no cuenta (el código ni siquiera corrió)
const REJECTED = new Set<Verdict>([Verdict.WA, Verdict.TLE, Verdict.MLE, Verdict.RE])

export interface StandingsTeam { id: number, name: string, category_id: number, suspended?: boolean }
export interface StandingsProblem { id: number, letter: string | null, title: string, category_id: number }
export interface StandingsCategory { id: number, code: string, name: string }
export interface StandingsSubmission {
    id: number
    team_id: number
    problem_id: number
    status: SubmissionStatus
    verdict: Verdict | null
    contest_ms: number
}

export interface StandingsInput {
    categories: StandingsCategory[]
    teams: StandingsTeam[]
    problems: StandingsProblem[]
    submissions: StandingsSubmission[]
}

// `freezeMs`: los envíos desde ese tiempo de concurso cuentan como pendientes (vista pública
// congelada). null = se ve todo
export function computeStandings(input: StandingsInput, freezeMs: number | null): IStandingsCategory[] {
    const submissions = [...input.submissions].sort((a, b) => a.contest_ms - b.contest_ms || a.id - b.id)

    return input.categories.map((category) => {
        const problems = input.problems
            .filter((problem) => problem.category_id === category.id)
            // Antes de iniciar no hay letras: entonces van en orden de creación
            .sort((a, b) => (a.letter ?? '').localeCompare(b.letter ?? '') || a.id - b.id)
        const teams = input.teams.filter((team) => team.category_id === category.id)
        const problemIds = new Set(problems.map((problem) => problem.id))

        const cells = new Map<string, IStandingsCell>()
        const cellOf = (teamId: number, problemId: number) => {
            const key = teamId + ':' + problemId
            let cell = cells.get(key)
            if(!cell){
                cell = { problemId, solved: false, rejected: 0, acMinute: null, firstToSolve: false, pending: 0 }
                cells.set(key, cell)
            }
            return cell
        }

        const firstSolver = new Map<number, { teamId: number, contestMs: number, id: number }>()
        for(const submission of submissions){
            if(!problemIds.has(submission.problem_id)) continue
            const cell = cellOf(submission.team_id, submission.problem_id)
            // Después del primer AC nada cambia la celda
            if(cell.solved) continue

            const hidden = freezeMs !== null && submission.contest_ms >= freezeMs
            const judged = submission.status === SubmissionStatus.DONE && submission.verdict !== Verdict.PENDING_REVIEW
            if(hidden || !judged){
                cell.pending++
                continue
            }

            if(submission.verdict === Verdict.AC){
                cell.solved = true
                cell.acMinute = Math.floor(submission.contest_ms / 60_000)
                const first = firstSolver.get(submission.problem_id)
                if(!first || submission.contest_ms < first.contestMs || (submission.contest_ms === first.contestMs && submission.id < first.id)){
                    firstSolver.set(submission.problem_id, { teamId: submission.team_id, contestMs: submission.contest_ms, id: submission.id })
                }
            } else if(submission.verdict && REJECTED.has(submission.verdict)){
                cell.rejected++
            }
        }
        for(const [problemId, first] of firstSolver) cellOf(first.teamId, problemId).firstToSolve = true

        const rows = teams.map((team) => {
            const teamCells = problems.map((problem) => cellOf(team.id, problem.id))
            const solvedCells = teamCells.filter((cell) => cell.solved)
            return {
                row: {
                    rank: null as number | null,
                    suspended: !!team.suspended,
                    teamId: team.id,
                    teamName: team.name,
                    solved: solvedCells.length,
                    penalty: solvedCells.reduce((total, cell) => total + cell.acMinute! + PENALTY_PER_REJECTION * cell.rejected, 0),
                    cells: teamCells,
                } satisfies IStandingsRow,
                lastAc: Math.max(-1, ...solvedCells.map((cell) => cell.acMinute!)),
            }
        })

        // Los suspendidos van al final, sin lugar, y no le quitan lugares a nadie
        rows.sort((a, b) =>
            Number(a.row.suspended) - Number(b.row.suspended)
            || b.row.solved - a.row.solved
            || a.row.penalty - b.row.penalty
            || a.lastAc - b.lastAc
            || a.row.teamName.localeCompare(b.row.teamName))

        // Empate exacto en los tres criterios: mismo lugar (1, 2, 2, 4)
        rows.forEach((entry, index) => {
            if(entry.row.suspended) return
            const previous = rows[index - 1]
            const tied = previous
                && previous.row.solved === entry.row.solved
                && previous.row.penalty === entry.row.penalty
                && previous.lastAc === entry.lastAc
            entry.row.rank = tied ? previous.row.rank : index + 1
        })

        return {
            categoryId: category.id,
            code: category.code,
            name: category.name,
            problems: problems.map((problem) => ({ id: problem.id, letter: problem.letter ?? '—', title: problem.title })),
            rows: rows.map((entry) => entry.row),
        }
    })
}
