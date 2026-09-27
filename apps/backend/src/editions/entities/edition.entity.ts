import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, OneToMany, type Relation } from "typeorm";
import { EditionStatus, type IEdition } from "@concurso/shared-types";
import { bigintTransformer } from "../../common/transformers/bigint.transformer.js";
import { Category } from "./category.entity.js";
import { Room } from "./room.entity.js";
import { EditionStaff } from "./edition-staff.entity.js";
import { Team } from "../../teams/entities/team.entity.js";

@Entity()
export class Edition implements IEdition {

    @PrimaryGeneratedColumn()
    declare id: number;

    @Column()
    declare name: string;

    @Column({ type: 'enum', enum: EditionStatus, default: EditionStatus.DRAFT })
    declare status: EditionStatus;

    // Se define al programar la edición (POST /editions/:id/schedule)
    @Column({ type: 'timestamptz', nullable: true })
    declare scheduled_start: Date | null;

    @Column({ type: 'bigint', unsigned: true, default: 0, transformer: bigintTransformer })
    declare duration_ms: number;

    @Column({ type: 'bigint', unsigned: true, default: 0, transformer: bigintTransformer })
    declare freeze_duration_ms: number;

    @Column({ type: 'timestamptz', nullable: true })
    declare started_at: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    declare paused_at: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    declare finished_at: Date | null;

    @Column({ type: 'boolean', default: false })
    declare block_submissions_on_alert: boolean;

    @Column({ type: 'simple-array', default: '' })
    declare forbidden_processes: string[];

    @CreateDateColumn({ type: 'timestamptz' })
    declare created_at: Date;

    @OneToMany(() => Category, category => category.edition)
    declare categories: Relation<Category[]>

    @OneToMany(() => Room, room => room.edition)
    declare rooms: Relation<Room[]>

    @OneToMany(() => Team, team => team.edition)
    declare teams: Relation<Team[]>

    @OneToMany(() => EditionStaff, staff => staff.edition)
    declare staff: Relation<EditionStaff[]>
}
