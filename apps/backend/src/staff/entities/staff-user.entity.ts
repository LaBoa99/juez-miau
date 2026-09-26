import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { RefreshToken } from "../../auth/entities/refresh-token.entity.js";

@Entity('staff_user')
export class StaffUser {

    @PrimaryGeneratedColumn()
    declare id: number

    @Column({ type: 'text' })
    declare name: string

    @Column({ type: 'citext', unique: true })
    declare email: string

    @Column({ type: 'text', select: false })
    declare password_hash: string

    @Column({ default: false })
    declare is_superadmin: boolean

    @Column({ default: true })
    declare active: boolean

    @CreateDateColumn({ type: 'timestamptz' })
    declare created_at: Date

    @OneToMany(() => RefreshToken, token => token.user)
    declare refresh_tokens: RefreshToken[]
}