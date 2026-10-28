import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from "typeorm";
import { FlagType } from "@concurso/shared-types";
import { Edition } from "../../editions/entities/edition.entity.js";
import { Team } from "../../teams/entities/team.entity.js";

// Alerta de integridad sobre un equipo; la resuelve el staff
@Entity()
@Index(['edition_id', 'resolved_at'])
@Index(['team_id', 'type', 'resolved_at'])
export class Flag {

    @PrimaryGeneratedColumn()
    declare id: number

    @Column()
    declare edition_id: number

    @Column()
    declare team_id: number

    @Column({ type: 'enum', enum: FlagType })
    declare type: FlagType

    // Texto para el staff: máquina anterior y nueva, proceso detectado...
    @Column({ type: 'text' })
    declare details: string

    // Para no repetir la misma alerta mientras siga abierta (p. ej. el nombre del proceso)
    @Column({ type: 'text' })
    declare dedupe_key: string

    @CreateDateColumn({ type: 'timestamptz' })
    declare created_at: Date

    @Column({ type: 'timestamptz', nullable: true })
    declare resolved_at: Date | null

    @Column({ type: 'int', nullable: true })
    declare resolved_by: number | null

    @Column({ type: 'text', nullable: true })
    declare resolution_note: string | null

    @ManyToOne(() => Edition, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'edition_id' })
    declare edition: Relation<Edition>

    @ManyToOne(() => Team, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'team_id' })
    declare team: Relation<Team>
}
