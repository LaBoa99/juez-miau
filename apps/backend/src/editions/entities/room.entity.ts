import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, PrimaryGeneratedColumn, type Relation } from "typeorm";
import type { IRoom } from "@concurso/shared-types";
import { Edition } from "./edition.entity.js";
import { RoomObserver } from "./room-observer.entity.js";
import { Team } from "../../teams/entities/team.entity.js";
import { Category } from "./category.entity.js";

@Entity()
export class Room implements IRoom {

    @PrimaryGeneratedColumn()
    declare id: number

    @Column()
    declare edition_id: number

    @Column({ type: 'varchar', length: 255})
    declare name: string

    @OneToMany(() => RoomObserver, observer => observer.room)
    declare observers: Relation<RoomObserver[]>

    @OneToMany(() => Team, team => team.room)
    declare teams: Relation<Team[]>

    // Categorías que se sientan aquí. Solo sirve para proponer salón a los equipos nuevos (alta e importación);
    // la categoría del equipo sigue siendo la que manda
    @ManyToMany(() => Category, { onDelete: 'CASCADE' })
    @JoinTable({ name: 'room_category', joinColumn: { name: 'room_id' }, inverseJoinColumn: { name: 'category_id' } })
    declare categories: Relation<Category[]>

    @ManyToOne(() => Edition, edition => edition.rooms, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'edition_id'})
    declare edition: Relation<Edition>
}
