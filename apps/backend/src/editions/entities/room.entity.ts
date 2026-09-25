import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import type { IRoom } from "@concurso/shared-types";
import { Edition } from "./edition.entity.js";
import { Category } from "./category.entity.js";
import { RoomObserver } from "./room-observer.entity.js";
import { Team } from "../../teams/entities/team.entity.js";

@Entity()
export class Room implements IRoom {

    @PrimaryGeneratedColumn()
    declare id: number

    @Column()
    declare edition_id: number

    @Column({ type: 'int', nullable: true })
    declare category_id: number | null

    @Column({ type: 'varchar', length: 255})
    declare name: string

    // SHA-256 del token del proyector del salón (un proyector por salón)
    @Column({ type: 'varchar', length: 64, unique: true, nullable: true, select: false })
    declare projector_token_hash: string | null

    @OneToMany(() => RoomObserver, observer => observer.room)
    declare observers: RoomObserver[]

    @OneToMany(() => Team, team => team.room)
    declare teams: Team[]

    @ManyToOne(() => Edition, edition => edition.rooms, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'edition_id'})
    declare edition: Edition

    @ManyToOne(() => Category, category => category.rooms)
    @JoinColumn({ name: 'category_id'})
    declare category: Category | null
}
