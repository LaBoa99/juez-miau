import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, type Relation } from "typeorm";
import { StaffRole, type IEditionStaff } from "@concurso/shared-types";
import { Edition } from "./edition.entity.js";
import { StaffUser } from "../../staff/entities/staff-user.entity.js";

@Entity()
export class EditionStaff implements IEditionStaff {

    @PrimaryColumn()
    declare edition_id: number

    @PrimaryColumn()
    declare staff_user_id: number

    @Column({ type: 'enum', enum: StaffRole })
    declare role: StaffRole

    @ManyToOne(() => Edition, edition => edition.staff, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'edition_id'})
    declare edition: Relation<Edition>

    // Al staff no se le borra, se le desactiva; si se borra, se van sus asignaciones
    @ManyToOne(() => StaffUser, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'staff_user_id' })
    declare staff_user: Relation<StaffUser>
}
