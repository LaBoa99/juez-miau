import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { EditionStatus, ProblemStatus, type IContestProblem, type IContestView } from '@concurso/shared-types'
import { toClockDto } from '../contest-clock/clock.js'
import { hasDriver, starterCode } from '../judge/drivers/index.js'
import { Problem } from '../problems/entities/problem.entity.js'
import { ProblemsService } from '../problems/services/problems.service.js'
import { Team } from '../teams/entities/team.entity.js'

// Los enunciados se muestran desde que inicia el concurso
const STARTED = [EditionStatus.RUNNING, EditionStatus.PAUSED, EditionStatus.FINISHED]

@Injectable()
export class ContestService {

    constructor(
        @InjectRepository(Team)
        private readonly teamRepository: Repository<Team>,
        @InjectRepository(Problem)
        private readonly problemRepository: Repository<Problem>,
        private readonly problemsService: ProblemsService,
    ) {}

    async getView(teamId: number): Promise<IContestView> {
        const team = await this.teamRepository.findOne({ where: { id: teamId }, relations: { edition: { languages: true } } })
        if(!team) throw new NotFoundException('team not found #' + teamId)

        const edition = team.edition
        const languages = edition.languages
            .filter((language) => language.active && hasDriver(language.code))
            .sort((a, b) => a.code.localeCompare(b.code))

        const problems = STARTED.includes(edition.status)
            ? await this.problemRepository.find({
                where: { edition_id: edition.id, category_id: team.category_id, status: ProblemStatus.PUBLISHED },
                order: { letter: 'ASC' },
            })
            : []

        return {
            edition: { id: edition.id, name: edition.name },
            clock: toClockDto(edition),
            languages: languages.map((language) => ({ id: language.id, code: language.code, compilerVersion: language.compiler_version })),
            problems: await Promise.all(problems.map(async (problem): Promise<IContestProblem> => ({
                id: problem.id,
                letter: problem.letter,
                points: problem.points,
                ...await this.problemsService.buildPreview(problem),
                starterCode: Object.fromEntries(languages.flatMap((language) => {
                    const code = problem.signature && starterCode(language.code, problem.signature)
                    return code ? [[language.code, code]] : []
                })),
            }))),
        }
    }
}
