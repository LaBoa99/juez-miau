import { Entity, JoinColumn, ManyToOne, PrimaryColumn, type Relation } from "typeorm";
import type { IRoomObserver } from "@concurso/shared-types";
import { Room } from "./room.entity.js";

@Entity()
export class RoomObserver implements IRoomObserver {

    @PrimaryColumn()
    declare room_id: number

    // TODO: relación ManyToOne con el entity de staff cuando exista
    @PrimaryColumn()
    declare staff_user_id: number

    @ManyToOne(() => Room, room => room.observers, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'room_id'})
    declare room: Relation<Room>
}
