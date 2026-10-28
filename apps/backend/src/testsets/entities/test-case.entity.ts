import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, type Relation } from "typeorm";
import { TestCaseOrigin, TestCaseVisibility } from "@concurso/shared-types";
import { bigintTransformer } from "../../common/transformers/bigint.transformer.js";
import { Testset } from "./testset.entity.js";

@Entity('test_case')
@Unique(['testset_id', 'ordinal'])
export class TestCase {

    @PrimaryGeneratedColumn()
    declare id: number

    @Column()
    declare testset_id: number

    @Column({ type: 'smallint' })
    declare ordinal: number

    @Column({ type: 'enum', enum: TestCaseVisibility })
    declare visibility: TestCaseVisibility

    @Column({ type: 'enum', enum: TestCaseOrigin })
    declare origin: TestCaseOrigin

    // sha256 en hexadecimal; el contenido se guarda aparte, direccionado por este hash
    @Column({ type: 'char', length: 64 })
    declare input_sha: string

    // null hasta que el build ejecuta la solución oficial
    @Column({ type: 'char', length: 64, nullable: true })
    declare output_sha: string | null

    @Column({ type: 'int' })
    declare input_bytes: number

    @Column({ type: 'int', nullable: true })
    declare output_bytes: number | null

    // Trazabilidad de los casos generados por esquema; null en los manuales
    @Column({ type: 'text', nullable: true })
    declare group_name: string | null

    @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
    declare seed: number | null

    @Column({ type: 'int', nullable: true })
    declare ref_time_ms: number | null

    @ManyToOne(() => Testset, testset => testset.test_cases, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'testset_id' })
    declare testset: Relation<Testset>
}
