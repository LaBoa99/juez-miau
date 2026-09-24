import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, OneToMany } from "typeorm";
import { IsBoolean, IsDate, IsEnum, IsInt, IsNotEmpty, IsString, MaxLength, Min } from "class-validator";
import { Type } from "class-transformer";
import { EditionStatus, type IEdition } from "@concurso/shared-types";
import { bigintTransformer } from "../../common/transformers/bigint.transformer.js";
import { Category } from "./category.entity.js";
import { Room } from "./room.entity.js";
import { EditionStaff } from "./edition-staff.entity.js";

@Entity()
export class Edition implements IEdition {

    @PrimaryGeneratedColumn()
    declare id: number;

    @Column()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    declare name: string;

    @Column({ type: 'enum', enum: EditionStatus, default: EditionStatus.DRAFT })
    @IsEnum(EditionStatus)
    declare status: EditionStatus;

    // Se define al programar la edición (POST /editions/:id/schedule)
    @Column({ type: 'timestamptz', nullable: true })
    @Type(() => Date)
    @IsDate()
    declare scheduled_start: Date | null;

    @Column({ type: 'bigint', unsigned: true, default: 0, transformer: bigintTransformer })
    @IsInt()
    @Min(1)
    declare duration_ms: number;

    @Column({ type: 'bigint', unsigned: true, default: 0, transformer: bigintTransformer })
    @IsInt()
    @Min(0)
    declare freeze_duration_ms: number;

    @Column({ type: 'timestamptz', nullable: true })
    declare started_at: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    declare paused_at: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    declare finished_at: Date | null;

    @Column({ type: 'boolean', default: false })
    @IsBoolean()
    declare block_submissions_on_alert: boolean;

    @Column({ type: 'simple-array', default: '' })
    declare forbidden_processes: string[];

    @CreateDateColumn({ type: 'timestamptz' })
    declare created_at: Date;

    @OneToMany(() => Category, category => category.edition)
    declare categories: Category[]

    @OneToMany(() => Room, room => room.edition)
    declare rooms: Room[]

    @OneToMany(() => EditionStaff, staff => staff.edition)
    declare staff: EditionStaff[]
}
