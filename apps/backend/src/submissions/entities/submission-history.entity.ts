import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from "typeorm";
import { SubmissionStatus, Verdict } from "@concurso/shared-types";
import { Submission } from "./submission.entity.js";

// Resultado que tenía un envío antes de re-juzgarlo
@Entity('submission_history')
@Index(['submission_id', 'judge_round'])
export class SubmissionHistory {

    @PrimaryGeneratedColumn()
    declare id: number

    @Column()
    declare submission_id: number

    @Column({ type: 'int' })
    declare judge_round: number

    @Column()
    declare testset_id: number

    @Column({ type: 'enum', enum: SubmissionStatus })
    declare status: SubmissionStatus

    @Column({ type: 'enum', enum: Verdict, nullable: true })
    declare verdict: Verdict | null

    @Column({ type: 'int', nullable: true })
    declare max_time_ms: number | null

    @Column({ type: 'timestamptz', nullable: true })
    declare judged_at: Date | null

    @Column({ type: 'text' })
    declare reason: string

    // null: automático (versión nueva del testset)
    @Column({ type: 'int', nullable: true })
    declare rejudged_by: number | null

    @CreateDateColumn({ type: 'timestamptz' })
    declare created_at: Date

    @ManyToOne(() => Submission, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'submission_id' })
    declare submission: Relation<Submission>
}
