import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique, type Relation } from "typeorm";
import { StaffUser } from "../../staff/entities/staff-user.entity.js";
import { ProblemStatus, type IProblemSignature } from "@concurso/shared-types";
import { Edition } from "../../editions/entities/edition.entity.js";
import { Category } from "../../editions/entities/category.entity.js";
import { Testset } from "../../testsets/entities/testset.entity.js";

@Entity()
@Unique(['edition_id', 'category_id', 'letter'])
export class Problem {

    @PrimaryGeneratedColumn()
    declare id: number

    @Column()
    declare edition_id: number

    @Column()
    declare category_id: number

    @Column({ type: 'text' })
    declare letter: string

    @Column({ type: 'text' })
    declare title: string

    @Column({ type: 'text' })
    declare statement_md: string

    @Column({ type: 'text' })
    declare input_format: string

    @Column({ type: 'text' })
    declare output_format: string

    @Column({ type: 'int', default: 1 })
    declare points: number

    @Column({ type: 'enum', enum: ProblemStatus, default: ProblemStatus.DRAFT })
    declare status: ProblemStatus

    // null mientras el juez no la define; publicar la exige
    @Column({ type: 'jsonb', nullable: true })
    declare signature: IProblemSignature | null

    // null solo durante el alta: el testset v1 se crea en la misma transacción
    @Column({ type: 'int', nullable: true })
    declare current_testset_id: number | null

    // Quien lo creó: solo él (o un admin de la edición / superadmin) lo puede editar.
    // null en problemas creados antes de guardar el autor
    @Column({ type: 'int', nullable: true })
    declare created_by: number | null

    @ManyToOne(() => Edition, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'edition_id' })
    declare edition: Relation<Edition>

    @ManyToOne(() => Category)
    @JoinColumn({ name: 'category_id' })
    declare category: Relation<Category>

    @OneToMany(() => Testset, testset => testset.problem)
    declare testsets: Relation<Testset[]>

    @ManyToOne(() => StaffUser)
    @JoinColumn({ name: 'created_by' })
    declare author: Relation<StaffUser> | null

    @ManyToOne(() => Testset, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'current_testset_id' })
    declare current_testset: Relation<Testset> | null
}
