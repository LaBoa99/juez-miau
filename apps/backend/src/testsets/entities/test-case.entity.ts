import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, type Relation } from "typeorm";
import { TestCaseOrigin, TestCaseVisibility } from "@concurso/shared-types";
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

    @Column({ type: 'char', length: 64 })
    declare output_sha: string

    @Column({ type: 'int' })
    declare input_bytes: number

    @Column({ type: 'int' })
    declare output_bytes: number

    @Column({ type: 'int', nullable: true })
    declare ref_time_ms: number | null

    @ManyToOne(() => Testset, testset => testset.test_cases, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'testset_id' })
    declare testset: Relation<Testset>
}
