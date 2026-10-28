import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, type Relation } from "typeorm";
import { SubmissionStatus, Verdict } from "@concurso/shared-types";
import { bigintTransformer } from "../../common/transformers/bigint.transformer.js";
import { Edition } from "../../editions/entities/edition.entity.js";
import { Team } from "../../teams/entities/team.entity.js";
import { Problem } from "../../problems/entities/problem.entity.js";
import { Language } from "../../languages/entities/language.entity.js";
import { Testset } from "../../testsets/entities/testset.entity.js";
import { SubmissionCase } from "./submission-case.entity.js";

@Entity()
// El marcador recorre los envíos de una edición en orden; el equipo consulta los suyos
@Index(['edition_id', 'id'])
@Index(['team_id', 'id'])
export class Submission {

    @PrimaryGeneratedColumn()
    declare id: number

    @Column()
    declare edition_id: number

    @Column()
    declare team_id: number

    @Column()
    declare problem_id: number

    @Column({ type: 'uuid' })
    declare language_id: string

    // Versión de los casos con la que se juzga, fijada al enviar: si el juez publica la v+1,
    // este envío no cambia hasta que se re-juzgue
    @Column()
    declare testset_id: number

    @Column({ type: 'bytea' })
    declare source: Buffer

    // sha256 en hexadecimal
    @Column({ type: 'char', length: 64 })
    declare source_sha: string

    @Column({ type: 'enum', enum: SubmissionStatus, default: SubmissionStatus.QUEUED })
    declare status: SubmissionStatus

    // null hasta que termina de juzgarse
    @Column({ type: 'enum', enum: Verdict, nullable: true })
    declare verdict: Verdict | null

    // Tiempo de concurso al recibirlo (sin pausas): es lo que cuenta para la penalización
    @Column({ type: 'bigint', transformer: bigintTransformer })
    declare contest_ms: number

    @Column({ type: 'int', nullable: true })
    declare max_time_ms: number | null

    @Column({ type: 'int', nullable: true })
    declare max_memory_kb: number | null

    @Column({ type: 'text', nullable: true })
    declare compile_log: string | null

    @CreateDateColumn({ type: 'timestamptz' })
    declare created_at: Date

    @Column({ type: 'timestamptz', nullable: true })
    declare judged_at: Date | null

    @ManyToOne(() => Edition, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'edition_id' })
    declare edition: Relation<Edition>

    @ManyToOne(() => Team, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'team_id' })
    declare team: Relation<Team>

    @ManyToOne(() => Problem, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'problem_id' })
    declare problem: Relation<Problem>

    @ManyToOne(() => Language)
    @JoinColumn({ name: 'language_id' })
    declare language: Relation<Language>

    @ManyToOne(() => Testset)
    @JoinColumn({ name: 'testset_id' })
    declare testset: Relation<Testset>

    @OneToMany(() => SubmissionCase, (submissionCase) => submissionCase.submission)
    declare cases: Relation<SubmissionCase[]>
}
