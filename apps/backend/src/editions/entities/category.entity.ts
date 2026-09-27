import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, type Relation } from "typeorm";
import type { ICategory } from "@concurso/shared-types";
import { Edition } from "./edition.entity.js";
import { Room } from "./room.entity.js";
import { Team } from "../../teams/entities/team.entity.js";

@Entity()
export class Category implements ICategory {

    @PrimaryGeneratedColumn()
    declare id: number

    @Column()
    declare edition_id: number

    @Column({ type: 'varchar', length: 255})
    declare code: string

    @Column({ type: 'varchar', length: 255})
    declare name: string

    @Column({ type: 'smallint', unsigned: true, default: 0 })
    declare sort_order: number

    @OneToMany(() => Room, room => room.category)
    declare rooms: Relation<Room[]>

    @OneToMany(() => Team, team => team.category)
    declare teams: Relation<Team[]>

    @ManyToOne(() => Edition, edition => edition.categories, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'edition_id'})
    declare edition: Relation<Edition>

}
