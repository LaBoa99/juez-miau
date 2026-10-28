import { Controller, Get, Header, Param, ParseIntPipe } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { StaffRole } from '@concurso/shared-types'
import { ANY_EDITION_ROLE, RequireEditionRole } from '../auth/decorators/access.decorators.js'
import { Problem } from '../problems/entities/problem.entity.js'
import { StandingsService } from '../standings/standings.service.js'
import { Submission } from '../submissions/entities/submission.entity.js'
import { Team } from '../teams/entities/team.entity.js'
import { toCsv } from './csv.js'

const CSV = 'text/csv; charset=utf-8'

@Controller('editions/:editionId/exports')
export class ExportsController {

    constructor(
        private readonly standingsService: StandingsService,
        @InjectRepository(Submission)
        private readonly submissionRepository: Repository<Submission>,
        @InjectRepository(Team)
        private readonly teamRepository: Repository<Team>,
        @InjectRepository(Problem)
        private readonly problemRepository: Repository<Problem>,
    ) {}

    // Marcador completo (vista del staff, sin congelar). Celda: "minuto del AC (+rechazos)" o "-rechazos"
    @Get('standings.csv')
    @RequireEditionRole(ANY_EDITION_ROLE)
    @Header('Content-Type', CSV)
    @Header('Content-Disposition', 'attachment; filename="marcador.csv"')
    async standings(@Param('editionId', ParseIntPipe) editionId: number): Promise<string> {
        const standings = await this.standingsService.getForStaff(editionId)
        const letters = [...new Set(standings.categories.flatMap((category) => category.problems.map((problem) => problem.letter)))].sort()

        const rows = standings.categories.flatMap((category) => category.rows.map((row) => {
            const byLetter = new Map(category.problems.map((problem, index) => [problem.letter, row.cells[index]]))
            return [
                category.name, row.rank, row.teamName, row.solved, row.penalty,
                ...letters.map((letter) => {
                    const cell = byLetter.get(letter)
                    if(!cell) return null
                    if(cell.solved) return cell.acMinute + (cell.rejected ? ' (+' + cell.rejected + ')' : '')
                    return cell.rejected ? '-' + cell.rejected : null
                }),
            ]
        }))
        return toCsv(['Categoría', 'Lugar', 'Equipo', 'Resueltos', 'Penalización', ...letters], rows)
    }

    @Get('submissions.csv')
    @RequireEditionRole([StaffRole.ADMIN, StaffRole.JUDGE])
    @Header('Content-Type', CSV)
    @Header('Content-Disposition', 'attachment; filename="envios.csv"')
    async submissions(@Param('editionId', ParseIntPipe) editionId: number): Promise<string> {
        const [submissions, teams, problems] = await Promise.all([
            this.submissionRepository.find({
                where: { edition_id: editionId },
                relations: { language: true },
                select: {
                    id: true, team_id: true, problem_id: true, status: true, verdict: true, contest_ms: true,
                    max_time_ms: true, max_memory_kb: true, judge_round: true, created_at: true,
                    language: { id: true, code: true },
                },
                order: { id: 'ASC' },
            }),
            this.teamRepository.find({ where: { edition_id: editionId }, select: { id: true, name: true } }),
            this.problemRepository.find({ where: { edition_id: editionId }, select: { id: true, letter: true } }),
        ])
        const teamNames = new Map(teams.map((team) => [team.id, team.name]))
        const letters = new Map(problems.map((problem) => [problem.id, problem.letter]))

        return toCsv(
            ['Envío', 'Equipo', 'Problema', 'Lenguaje', 'Veredicto', 'Estado', 'Minuto', 'Tiempo (ms)', 'Memoria (KB)', 'Rejudges', 'Fecha'],
            submissions.map((submission) => [
                submission.id,
                teamNames.get(submission.team_id) ?? '#' + submission.team_id,
                letters.get(submission.problem_id) ?? '#' + submission.problem_id,
                submission.language.code,
                submission.verdict,
                submission.status,
                Math.floor(submission.contest_ms / 60_000),
                submission.max_time_ms,
                submission.max_memory_kb,
                submission.judge_round,
                submission.created_at.toISOString(),
            ]),
        )
    }
}
