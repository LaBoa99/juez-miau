import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, type Relation } from "typeorm";
import { StaffRole, type IEditionStaff } from "@concurso/shared-types";
import { Edition } from "./edition.entity.js";

@Entity()
export class EditionStaff implements IEditionStaff {

    @PrimaryColumn()
    declare edition_id: number

    // TODO: relación ManyToOne con el entity de staff cuando exista
    @PrimaryColumn()
    declare staff_user_id: number

    @Column({ type: 'enum', enum: StaffRole })
    declare role: StaffRole

    @ManyToOne(() => Edition, edition => edition.staff, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'edition_id'})
    declare edition: Relation<Edition>
}
