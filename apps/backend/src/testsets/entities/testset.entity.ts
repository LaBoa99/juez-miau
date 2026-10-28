import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique, type Relation } from "typeorm";
import { CompareMode, TestsetStatus, type ITestsetSchema } from "@concurso/shared-types";
import { bigintTransformer } from "../../common/transformers/bigint.transformer.js";
import { Problem } from "../../problems/entities/problem.entity.js";
import { StaffUser } from "../../staff/entities/staff-user.entity.js";
import { RefSolution } from "./ref-solution.entity.js";
import { Generator } from "./generator.entity.js";
import { TestCase } from "./test-case.entity.js";

@Entity()
@Unique(['problem_id', 'version'])
export class Testset {

    @PrimaryGeneratedColumn()
    declare id: number

    @Column()
    declare problem_id: number

    @Column({ type: 'int' })
    declare version: number

    // null mientras el testset está vacío (la v1 se crea junto con el problema, RF-17)
    @Column({ type: 'int', nullable: true })
    declare ref_solution_id: number | null

    @Column({ type: 'int', nullable: true })
    declare generator_id: number | null

    @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
    declare seed: number | null

    @Column({ type: 'int', nullable: true })
    declare generated_count: number | null

    @Column({ type: 'int', default: 1000 })
    declare time_limit_ms: number

    @Column({ type: 'int', default: 256 })
    declare memory_limit_mb: number

    @Column({ type: 'int', nullable: true })
    declare ref_max_time_ms: number | null

    // Esquema declarativo para generar casos; null si solo hay casos manuales
    @Column({ type: 'jsonb', nullable: true })
    declare schema: ITestsetSchema | null

    @Column({ type: 'enum', enum: CompareMode, default: CompareMode.EXACT })
    declare compare_mode: CompareMode

    // Solo aplica con compare_mode = tolerance
    @Column({ type: 'double precision', nullable: true })
    declare float_tolerance: number | null

    // Revisión híbrida (judge-evaluation.md §5): los AC quedan en PENDING_REVIEW para un juez
    @Column({ type: 'boolean', default: false })
    declare manual_review: boolean

    @Column({ type: 'text', nullable: true })
    declare review_instructions: string | null

    // DRAFT es el único estado editable (FAILED vuelve a DRAFT al editarlo); READY es inmutable
    @Column({ type: 'enum', enum: TestsetStatus, default: TestsetStatus.DRAFT })
    declare status: TestsetStatus

    @Column({ type: 'text', nullable: true })
    declare build_log: string | null

    @Column()
    declare author_id: number

    @Column({ type: 'text', nullable: true })
    declare reason: string | null

    @CreateDateColumn({ type: 'timestamptz' })
    declare created_at: Date

    @ManyToOne(() => Problem, problem => problem.testsets, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'problem_id' })
    declare problem: Relation<Problem>

    @ManyToOne(() => RefSolution)
    @JoinColumn({ name: 'ref_solution_id' })
    declare ref_solution: Relation<RefSolution> | null

    @ManyToOne(() => Generator)
    @JoinColumn({ name: 'generator_id' })
    declare generator: Relation<Generator> | null

    @ManyToOne(() => StaffUser)
    @JoinColumn({ name: 'author_id' })
    declare author: Relation<StaffUser>

    @OneToMany(() => TestCase, testCase => testCase.testset)
    declare test_cases: Relation<TestCase[]>
}
