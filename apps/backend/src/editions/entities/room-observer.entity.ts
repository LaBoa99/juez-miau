import { Entity, JoinColumn, ManyToOne, PrimaryColumn, type Relation } from "typeorm";
import type { IRoomObserver } from "@concurso/shared-types";
import { Room } from "./room.entity.js";
import { StaffUser } from "../../staff/entities/staff-user.entity.js";

@Entity()
export class RoomObserver implements IRoomObserver {

    @PrimaryColumn()
    declare room_id: number

    @PrimaryColumn()
    declare staff_user_id: number

    @ManyToOne(() => Room, room => room.observers, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'room_id'})
    declare room: Relation<Room>

    // Al staff no se le borra, se le desactiva; si se borra, se van sus asignaciones
    @ManyToOne(() => StaffUser, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'staff_user_id' })
    declare staff_user: Relation<StaffUser>
}
