import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from "typeorm";
import { Edition } from "../../editions/entities/edition.entity.js";
import { Problem } from "../../problems/entities/problem.entity.js";
import { Team } from "../../teams/entities/team.entity.js";

// Pregunta de un equipo durante el concurso; la respuesta es visible para todos los equipos de la categoría
@Entity()
@Index(['edition_id', 'answered_at'])
export class Clarification {

    @PrimaryGeneratedColumn()
    declare id: number

    @Column()
    declare edition_id: number

    @Column()
    declare team_id: number

    // null: pregunta general del concurso
    @Column({ type: 'int', nullable: true })
    declare problem_id: number | null

    @Column({ type: 'text' })
    declare question: string

    @Column({ type: 'text', nullable: true })
    declare answer: string | null

    @Column({ type: 'int', nullable: true })
    declare answered_by: number | null

    @Column({ type: 'timestamptz', nullable: true })
    declare answered_at: Date | null

    @CreateDateColumn({ type: 'timestamptz' })
    declare created_at: Date

    @ManyToOne(() => Edition, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'edition_id' })
    declare edition: Relation<Edition>

    @ManyToOne(() => Team, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'team_id' })
    declare team: Relation<Team>

    @ManyToOne(() => Problem, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'problem_id' })
    declare problem: Relation<Problem> | null
}
