import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

// Una fila por cambio hecho por el staff (POST, PUT, PATCH, DELETE). Sin FK: el registro se
// conserva aunque se borre el usuario o la edición
@Entity('audit_log')
@Index(['edition_id', 'id'])
@Index(['staff_user_id', 'id'])
export class AuditLog {

    @PrimaryGeneratedColumn()
    declare id: number

    @Column()
    declare staff_user_id: number

    @Column({ type: 'int', nullable: true })
    declare edition_id: number | null

    @Column({ type: 'varchar', length: 10 })
    declare method: string

    @Column({ type: 'text' })
    declare path: string

    @Column({ type: 'smallint' })
    declare status_code: number

    @Column({ type: 'jsonb', nullable: true })
    declare body: Record<string, unknown> | null

    @CreateDateColumn({ type: 'timestamptz' })
    declare created_at: Date
}
