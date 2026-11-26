import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from "typeorm";
import { FlagOutcome, FlagType } from "@concurso/shared-types";
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

    // Decisión del juez; null si sigue abierta o se resolvió antes de existir esta regla (no penaliza)
    @Column({ type: 'enum', enum: FlagOutcome, nullable: true })
    declare outcome: FlagOutcome | null

    // Tiempo de concurso al confirmarla: el marcador congelado no muestra lo confirmado después
    @Column({ type: 'int', nullable: true })
    declare outcome_contest_ms: number | null

    // Última vez que se detectó: si sigue presente tras resolverla, es el mismo incidente
    @Column({ type: 'timestamptz', default: () => 'now()' })
    declare last_seen_at: Date

    // Número de falta de este tipo y llave: 2 o más es reincidencia
    @Column({ type: 'int', default: 1 })
    declare offense: number

    // Veces que se detectó mientras seguía abierta. Un programa prohibido lo cierra la app,
    // así que cada detección es un intento nuevo
    @Column({ type: 'int', default: 1 })
    declare attempts: number

    @ManyToOne(() => Edition, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'edition_id' })
    declare edition: Relation<Edition>

    @ManyToOne(() => Team, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'team_id' })
    declare team: Relation<Team>
}
