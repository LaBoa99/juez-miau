import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from "typeorm";
import { Team } from "./team.entity.js";

@Entity()
export class TeamSession {

    // PK y FK a la vez: garantiza una sola sesión por equipo
    @PrimaryColumn()
    declare team_id: number

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

    @OneToOne(() => Team, team => team.teamSession, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'team_id' })
    declare team: Team

}
