import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from "typeorm";
import { Verdict } from "@concurso/shared-types";
import { Submission } from "./submission.entity.js";

// Cada decisión de revisión manual; el envío solo guarda la última (reviewed_by / reviewed_at)
@Entity('submission_review')
@Index(['submission_id'])
export class SubmissionReview {

    @PrimaryGeneratedColumn()
    declare id: number

    @Column()
    declare submission_id: number

    @Column({ type: 'enum', enum: Verdict })
    declare verdict: Verdict

    @Column({ type: 'int' })
    declare reviewed_by: number

    @Column({ type: 'text', nullable: true })
    declare comment: string | null

    @CreateDateColumn({ type: 'timestamptz' })
    declare created_at: Date

    @ManyToOne(() => Submission, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'submission_id' })
    declare submission: Relation<Submission>
}
