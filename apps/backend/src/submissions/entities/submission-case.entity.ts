import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, type Relation } from "typeorm";
import { Verdict } from "@concurso/shared-types";
import { Submission } from "./submission.entity.js";

// Resultado de cada caso que se ejecutó (la ejecución se detiene en el primer TLE, MLE o RE)
@Entity('submission_case')
@Unique(['submission_id', 'ordinal'])
export class SubmissionCase {

    @PrimaryGeneratedColumn()
    declare id: number

    @Column()
    declare submission_id: number

    // `ordinal` del test_case del testset del envío
    @Column({ type: 'smallint' })
    declare ordinal: number

    @Column({ type: 'enum', enum: Verdict })
    declare verdict: Verdict

    @Column({ type: 'int' })
    declare cpu_ms: number

    @Column({ type: 'int' })
    declare wall_ms: number

    @Column({ type: 'int' })
    declare memory_kb: number

    // Por qué falló (stderr del RE, tipo de resultado incorrecto...). Solo lo ve el staff
    @Column({ type: 'text', nullable: true })
    declare message: string | null

    @ManyToOne(() => Submission, (submission) => submission.cases, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'submission_id' })
    declare submission: Relation<Submission>
}
