import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm"
import { StaffUser } from "../../staff/entities/staff-user.entity.js"

@Entity('refresh_token')
export class RefreshToken {

    @PrimaryGeneratedColumn()
    declare id: number

    @Column({ type: 'text', unique: true })
    declare token_hash: string

    @Column({ type: 'timestamptz' })
    declare expires_at: Date

    @Column({ type: 'timestamptz', nullable: true })
    declare revoked_at: Date | null

    @CreateDateColumn({ type: 'timestamptz' })
    declare created_at: Date

    @ManyToOne(() => StaffUser, user => user.refresh_tokens, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    declare user: StaffUser
}