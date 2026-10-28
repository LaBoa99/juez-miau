import { ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, UnprocessableEntityException, type OnApplicationBootstrap } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, LessThan, MoreThan, Repository, type FindOptionsWhere } from 'typeorm'
import {
    ProblemStatus,
    SOCKET_EVENTS,
    StaffRole,
    SubmissionStatus,
    Verdict,
    type IRejudgeResponse,
    type ISubmissionHistoryEntry,
    type ISubmission,
    type ISubmissionDetail,
    type IStaffSubmission,
    type IStaffSubmissionDetail,
} from '@concurso/shared-types'
import { ANY_EDITION_ROLE } from '../../auth/decorators/access.decorators.js'
import { BlobsService } from '../../blobs/services/blobs.service.js'
import { acceptsSubmissions, elapsedMs } from '../../contest-clock/clock.js'
import { Edition } from '../../editions/entities/edition.entity.js'
import { EditionStaffService } from '../../editions/services/edition-staff.service.js'
import { hasDriver } from '../../judge/drivers/index.js'
import { Language } from '../../languages/entities/language.entity.js'
import { Problem } from '../../problems/entities/problem.entity.js'
import { RealtimeService } from '../../realtime/realtime.service.js'
import { Team } from '../../teams/entities/team.entity.js'
import { CreateSubmissionDto } from '../dto/create-submission.dto.js'
import { SubmissionFiltersDto } from '../dto/submission-filters.dto.js'
import { RejudgeProblemDto, RejudgeSubmissionDto } from '../dto/rejudge.dto.js'
import { ReviewSubmissionDto } from '../dto/review-submission.dto.js'
import { Submission } from '../entities/submission.entity.js'
import { SubmissionHistory } from '../entities/submission-history.entity.js'
import { toStaffSubmissionDto, toSubmissionDto } from '../mappers/submission.mapper.js'
import { MAX_SOURCE_BYTES, SUBMISSION_COOLDOWN_MS } from '../submissions.constants.js'
import { SubmissionQueueService } from './submission-queue.service.js'

const JUDGE_ROLES = [StaffRole.ADMIN, StaffRole.JUDGE]

const DEFAULT_PAGE = 50

@Injectable()
export class SubmissionsService implements OnApplicationBootstrap {
    private readonly logger = new Logger(SubmissionsService.name)
    private readonly changeListeners: ((submission: Submission) => void)[] = []

    constructor(
        @InjectRepository(Submission)
        private readonly submissionRepository: Repository<Submission>,
        @InjectRepository(Team)
        private readonly teamRepository: Repository<Team>,
        @InjectRepository(Problem)
        private readonly problemRepository: Repository<Problem>,
        @InjectRepository(Language)
        private readonly languageRepository: Repository<Language>,
        @InjectRepository(SubmissionHistory)
        private readonly historyRepository: Repository<SubmissionHistory>,
        private readonly queueService: SubmissionQueueService,
        private readonly editionStaffService: EditionStaffService,
        private readonly realtime: RealtimeService,
    ) {}

    // Los envíos se guardan antes de encolarse: si Redis falló o la API se cayó en medio,
    // al arrancar se vuelven a encolar (el jobId fijo evita duplicados)
    async onApplicationBootstrap(): Promise<void> {
        const pending = await this.submissionRepository.find({
            where: { status: In([SubmissionStatus.QUEUED, SubmissionStatus.JUDGING]) },
            select: { id: true, judge_round: true },
            order: { id: 'ASC' },
        })
        for(const { id, judge_round } of pending){
            await this.queueService.enqueue(id, judge_round).catch((error: unknown) => this.logger.warn('could not requeue submission #' + id + ': ' + String(error)))
        }
        if(pending.length > 0) this.logger.log('requeued ' + pending.length + ' pending submission(s)')
    }

    async create(teamId: number, dto: CreateSubmissionDto): Promise<ISubmission> {
        const team = await this.teamRepository.findOne({ where: { id: teamId }, relations: { edition: true } })
        if(!team) throw new NotFoundException('team not found #' + teamId)

        const edition = team.edition
        if(!acceptsSubmissions(edition)){
            throw new ConflictException('the contest is not running (status: ' + edition.status + ')')
        }

        const problem = await this.problemRepository.findOneBy({
            id: dto.problemId,
            edition_id: edition.id,
            category_id: team.category_id,
            status: ProblemStatus.PUBLISHED,
        })
        // Mismo 404 para un problema de otra categoría: el equipo no tiene por qué saber que existe
        if(!problem?.current_testset_id) throw new NotFoundException('problem not found #' + dto.problemId)

        const language = await this.languageRepository.findOneBy({ id: dto.languageId, active: true })
        const enabled = language && await this.teamRepository.manager.getRepository(Edition).exists({
            where: { id: edition.id, languages: { id: language.id } },
        })
        if(!language || !enabled || !hasDriver(language.code)){
            throw new UnprocessableEntityException('language ' + dto.languageId + ' is not enabled in this contest')
        }

        const source = Buffer.from(dto.source, 'utf8')
        if(source.length > MAX_SOURCE_BYTES){
            throw new UnprocessableEntityException('source is larger than ' + MAX_SOURCE_BYTES / 1024 + ' KB')
        }

        const recent = await this.submissionRepository.exists({
            where: { team_id: team.id, created_at: MoreThan(new Date(Date.now() - SUBMISSION_COOLDOWN_MS)) },
        })
        if(recent){
            throw new HttpException('wait ' + SUBMISSION_COOLDOWN_MS / 1000 + ' s between submissions', HttpStatus.TOO_MANY_REQUESTS)
        }

        const submission = await this.submissionRepository.save(this.submissionRepository.create({
            edition_id: edition.id,
            team_id: team.id,
            problem_id: problem.id,
            language_id: language.id,
            testset_id: problem.current_testset_id,
            source,
            source_sha: BlobsService.sha256(source),
            status: SubmissionStatus.QUEUED,
            verdict: null,
            contest_ms: elapsedMs(edition),
        }))

        // Si Redis falla el envío queda guardado como QUEUED y se encola al reiniciar la API
        await this.queueService.enqueue(submission.id, submission.judge_round).catch((error: unknown) =>
            this.logger.error('could not enqueue submission #' + submission.id, error instanceof Error ? error.stack : undefined))

        this.publish(submission)
        return toSubmissionDto(submission)
    }

    async findForTeam(teamId: number): Promise<ISubmission[]> {
        const submissions = await this.submissionRepository.find({
            where: { team_id: teamId },
            order: { id: 'DESC' },
            select: this.withoutSource(),
        })
        return submissions.map(toSubmissionDto)
    }

    async findOneForTeam(teamId: number, id: number): Promise<ISubmissionDetail> {
        const submission = await this.submissionRepository.findOneBy({ id, team_id: teamId })
        if(!submission) throw new NotFoundException('submission not found #' + id)
        return { ...toSubmissionDto(submission), source: submission.source.toString('utf8') }
    }

    async findForEdition(editionId: number, filters: SubmissionFiltersDto): Promise<IStaffSubmission[]> {
        const where: FindOptionsWhere<Submission> = { edition_id: editionId }
        if(filters.teamId !== undefined) where.team_id = filters.teamId
        if(filters.problemId !== undefined) where.problem_id = filters.problemId
        if(filters.verdict !== undefined) where.verdict = filters.verdict
        if(filters.status !== undefined) where.status = filters.status
        if(filters.before !== undefined) where.id = LessThan(filters.before)

        const submissions = await this.submissionRepository.find({
            where,
            order: { id: 'DESC' },
            take: filters.limit ?? DEFAULT_PAGE,
            select: this.withoutSource(),
        })
        return submissions.map(toStaffSubmissionDto)
    }

    async findOneForStaff(staffUserId: number, id: number): Promise<IStaffSubmissionDetail> {
        const submission = await this.submissionRepository.findOne({ where: { id }, relations: { cases: true } })
        if(!submission) throw new NotFoundException('submission not found #' + id)

        await this.editionStaffService.assertRole(staffUserId, submission.edition_id, ANY_EDITION_ROLE)
        return { ...toStaffSubmissionDto(submission), source: submission.source.toString('utf8') }
    }

    // Avisa al equipo y al staff de la edición. Lo usan la creación y los eventos del juez
    publish(submission: Submission): void {
        this.realtime.toTeam(submission.team_id, SOCKET_EVENTS.SUBMISSION_UPDATE, toSubmissionDto(submission))
        this.realtime.toStaff(submission.edition_id, SOCKET_EVENTS.SUBMISSION_UPDATE, toStaffSubmissionDto(submission))
        for(const listener of this.changeListeners){
            try {
                listener(submission)
            } catch(error) {
                this.logger.error('submission listener failed', error instanceof Error ? error.stack : undefined)
            }
        }
    }

    // El marcador se registra aquí: cada envío nuevo o veredicto lo cambia
    onChange(listener: (submission: Submission) => void): void {
        this.changeListeners.push(listener)
    }

    // ─── Rejudge ─────────────────────────────────────────────────

    async rejudgeSubmission(staffUserId: number, id: number, dto: RejudgeSubmissionDto): Promise<IRejudgeResponse> {
        const submission = await this.getSubmission(id)
        await this.editionStaffService.assertRole(staffUserId, submission.edition_id, JUDGE_ROLES)
        return this.rejudge({ submissionIds: [id] }, dto.reason, staffUserId)
    }

    async rejudgeProblem(staffUserId: number, problemId: number, dto: RejudgeProblemDto): Promise<IRejudgeResponse> {
        const problem = await this.problemRepository.findOneBy({ id: problemId })
        if(!problem) throw new NotFoundException('problem not found #' + problemId)
        await this.editionStaffService.assertRole(staffUserId, problem.edition_id, JUDGE_ROLES)
        return this.rejudge({ problemId, verdicts: dto.verdicts }, dto.reason, staffUserId)
    }

    async findHistory(staffUserId: number, id: number): Promise<ISubmissionHistoryEntry[]> {
        const submission = await this.getSubmission(id)
        await this.editionStaffService.assertRole(staffUserId, submission.edition_id, ANY_EDITION_ROLE)
        const entries = await this.historyRepository.find({ where: { submission_id: id }, order: { judge_round: 'ASC' } })
        return entries.map((entry) => ({
            judgeRound: entry.judge_round,
            testsetId: entry.testset_id,
            status: entry.status,
            verdict: entry.verdict,
            maxTimeMs: entry.max_time_ms,
            judgedAt: entry.judged_at,
            reason: entry.reason,
            rejudgedBy: entry.rejudged_by,
            createdAt: entry.created_at,
        }))
    }

    private async rejudge(target: Parameters<SubmissionQueueService['rejudge']>[0], reason: string, staffUserId: number): Promise<IRejudgeResponse> {
        const submissions = await this.queueService.rejudge(target, { reason, staffUserId })
        // Pasan a pendientes en el marcador hasta tener el veredicto nuevo
        submissions.forEach((submission) => this.publish(submission))
        return { submissionIds: submissions.map((submission) => submission.id) }
    }

    // ─── Revisión manual ─────────────────────────────────────────

    // Los más viejos primero: es una cola
    async findPendingReview(editionId: number): Promise<IStaffSubmission[]> {
        const submissions = await this.submissionRepository.find({
            where: { edition_id: editionId, status: SubmissionStatus.DONE, verdict: Verdict.PENDING_REVIEW },
            order: { id: 'ASC' },
            select: this.withoutSource(),
        })
        return submissions.map(toStaffSubmissionDto)
    }

    async review(staffUserId: number, id: number, dto: ReviewSubmissionDto): Promise<IStaffSubmission> {
        const submission = await this.getSubmission(id)
        await this.editionStaffService.assertRole(staffUserId, submission.edition_id, JUDGE_ROLES)

        const changes = {
            verdict: dto.accept ? Verdict.AC : Verdict.WA,
            reviewed_by: staffUserId,
            reviewed_at: new Date(),
            review_comment: dto.comment?.trim() || null,
        }
        // Condicional: dos jueces revisando a la vez, o un rejudge en medio
        const result = await this.submissionRepository.update(
            { id, status: SubmissionStatus.DONE, verdict: Verdict.PENDING_REVIEW, judge_round: submission.judge_round },
            changes,
        )
        if(!result.affected){
            throw new ConflictException('submission #' + id + ' is not pending review')
        }

        Object.assign(submission, changes)
        this.publish(submission)
        return toStaffSubmissionDto(submission)
    }

    private async getSubmission(id: number): Promise<Submission> {
        const submission = await this.submissionRepository.findOne({ where: { id }, select: this.withoutSource() })
        if(!submission) throw new NotFoundException('submission not found #' + id)
        return submission
    }

    // El código puede pesar 64 KB; en las listas no hace falta
    private withoutSource(): Partial<Record<keyof Submission, true>> {
        return {
            id: true, edition_id: true, team_id: true, problem_id: true, language_id: true, testset_id: true,
            source_sha: true, status: true, verdict: true, contest_ms: true, max_time_ms: true, max_memory_kb: true,
            compile_log: true, judge_round: true, reviewed_by: true, reviewed_at: true, review_comment: true,
            created_at: true, judged_at: true,
        }
    }
}
