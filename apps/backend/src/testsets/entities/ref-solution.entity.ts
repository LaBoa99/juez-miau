import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from "typeorm";
import { Problem } from "../../problems/entities/problem.entity.js";
import { Language } from "../../languages/entities/language.entity.js";
import { StaffUser } from "../../staff/entities/staff-user.entity.js";

@Entity('ref_solution')
export class RefSolution {

    @PrimaryGeneratedColumn()
    declare id: number

    @Column()
    declare problem_id: number

    @Column({ type: 'uuid' })
    declare language_id: string

    @Column({ type: 'bytea' })
    declare source: Buffer

    // sha256 en hexadecimal
    @Column({ type: 'char', length: 64 })
    declare source_sha: string

    @Column()
    declare created_by: number

    @CreateDateColumn({ type: 'timestamptz' })
    declare created_at: Date

    @ManyToOne(() => Problem, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'problem_id' })
    declare problem: Relation<Problem>

    @ManyToOne(() => Language)
    @JoinColumn({ name: 'language_id' })
    declare language: Relation<Language>

    @ManyToOne(() => StaffUser)
    @JoinColumn({ name: 'created_by' })
    declare creator: Relation<StaffUser>
}
