import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm"

export type SessionEndReason = 'logout' | 'forced' | 'replaced'

@Entity('team_session')
@Index(['team_id'], { unique: true, where: 'ended_at IS NULL' }) // solo una sesión activa por equipo
export class TeamSession {
    @PrimaryGeneratedColumn()
    declare id: number

    @CreateDateColumn({ type: 'timestamptz' })
    declare started_at: Date

    @Column({ type: 'timestamptz', nullable: true })
    declare last_heartbeat_at: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    declare ended_at: Date | null

    @Column({ type: 'text', nullable: true })
    declare end_reason: SessionEndReason | null

    //@ManyToOne(() => Team, { onDelete: 'CASCADE' })
    //@JoinColumn({ name: 'team_id' })
    //declare team: Team
}