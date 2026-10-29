import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, type Relation } from "typeorm";
import { Team } from "./team.entity.js";

@Entity()
export class TeamSession {

    // PK y FK a la vez: garantiza una sola sesión por equipo
    @PrimaryColumn()
    declare team_id: number

    // Cambia en cada login; va en el JWT del equipo para invalidar tokens de sesiones anteriores
    @Column({ type: 'uuid', nullable: true })
    declare session_id: string | null

    @Column({ type: 'text', nullable: true })
    declare machine_id: string | null

    @Column({ type: 'text', nullable: true })
    declare end_reason: string | null

    @Column({ type: 'timestamptz' })
    declare started_at: Date

    @Column({ type: 'timestamptz' })
    declare last_heartbeat_at: Date

    @Column({ type: 'timestamptz', nullable: true })
    declare ended_at: Date | null

    // Interfaces de red del primer heartbeat de la sesión; las nuevas levantan NETWORK_CHANGE
    @Column({ type: 'simple-array', nullable: true })
    declare network_baseline: string[] | null

    @OneToOne(() => Team, team => team.teamSession, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'team_id' })
    declare team: Relation<Team>

}
