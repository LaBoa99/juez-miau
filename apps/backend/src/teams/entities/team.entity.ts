import { Exclude } from "class-transformer";
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn, type Relation } from "typeorm";
import { Edition } from "../../editions/entities/edition.entity.js";
import { Category } from "../../editions/entities/category.entity.js";
import { Room } from "../../editions/entities/room.entity.js";
import { TeamMember } from "./team-member.entity.js";
import { TeamSession } from "./team-session.entity.js";

@Entity()
export class Team {
    
    @PrimaryGeneratedColumn()
    declare id: number

    @Column()
    declare edition_id: number

    @Column()
    declare category_id: number

    // null = el equipo aún no tiene salón asignado (p. ej. recién importado del CSV)
    @Column({ type: 'int', nullable: true })
    declare room_id: number | null

    @Column({ type: 'text' })
    declare name: string

    @Column({ type: 'citext' })
    declare username: string

    @Column({ type: 'text' })
    @Exclude()
    declare password: string // bidireccional password 

    @Column({ type: 'varchar', length: 256 })
    @Exclude()
    declare password_hash: string

    @CreateDateColumn({ type: 'timestamptz'})
    declare created_at: Date

    @OneToOne(() => TeamSession, teamSession => teamSession.team)
    declare teamSession: Relation<TeamSession> | null

    @OneToMany(() => TeamMember, teamMember => teamMember.team)
    declare members: Relation<TeamMember[]>

    @ManyToOne(() => Edition, edition => edition.teams)
    @JoinColumn({ name: 'edition_id'})
    declare edition: Relation<Edition>

    @ManyToOne(() => Category, category => category.teams)
    @JoinColumn({ name: 'category_id'})
    declare category: Relation<Category>

    @ManyToOne(() => Room, room => room.teams)
    @JoinColumn({ name: 'room_id' })
    declare room: Relation<Room> | null
}