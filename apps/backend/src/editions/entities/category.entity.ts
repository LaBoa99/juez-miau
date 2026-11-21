import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, type Relation } from "typeorm";
import type { ICategory } from "@concurso/shared-types";
import { Edition } from "./edition.entity.js";
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

    // Categoría especial: sus problemas se evalúan como programa completo (programa-completo.md)
    @Column({ type: 'boolean', default: false })
    declare full_program: boolean

    @OneToMany(() => Team, team => team.category)
    declare teams: Relation<Team[]>

    @ManyToOne(() => Edition, edition => edition.categories, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'edition_id'})
    declare edition: Relation<Edition>

}
