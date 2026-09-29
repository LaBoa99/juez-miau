import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import type { ILanguage } from "@concurso/shared-types";
import { decimalTransformer } from "../../common/transformers/decimal.transformer.js";

@Entity()
export class Language implements ILanguage {

    @PrimaryGeneratedColumn("uuid")
    declare id: string;

    @Column({ type: 'varchar', unique: true, length: 100 })
    declare code: string;

    @Column("text")
    declare image_ref: string;

    @Column("text")
    declare compile_cmd: string;

    @Column("text")
    declare run_cmd: string;

    @Column("text")
    declare compiler_version: string;

    @Column({ type: 'text', default: '' })
    declare flags: string;

    // Sin punto: "cpp", "py", "java"
    @Column({ type: 'varchar', length: 4, unique: true })
    declare file_ext: string;

    @Column({ type: 'decimal', precision: 4, scale: 2, default: 1, transformer: decimalTransformer })
    declare time_multiplier: number;

    @Column({ type: 'boolean', default: true })
    declare active: boolean;
}
