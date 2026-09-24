import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { IsEnum, IsInt, Min } from "class-validator";
import { StaffRole, type IEditionStaff } from "@concurso/shared-types";
import { Edition } from "./edition.entity.js";

@Entity()
export class EditionStaff implements IEditionStaff {

    @PrimaryColumn()
    declare edition_id: number

    // TODO: relación ManyToOne con el entity de staff cuando exista
    @PrimaryColumn()
    @IsInt()
    @Min(1)
    declare staff_user_id: number

    @Column({ type: 'enum', enum: StaffRole })
    @IsEnum(StaffRole)
    declare role: StaffRole

    @ManyToOne(() => Edition, edition => edition.staff, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'edition_id'})
    declare edition: Edition
}
