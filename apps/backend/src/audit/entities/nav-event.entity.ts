import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import type { EditionSection, NavRole } from "@concurso/shared-types";

// Un clic en la barra de secciones de una edición (prueba de calor del orden). Solo el rol y un id de pestaña,
// no quién: sirve para ver qué secciones se usan y qué saltos se repiten. Sin FK, como audit_log
@Entity('nav_event')
@Index(['edition_id', 'id'])
export class NavEvent {

    @PrimaryGeneratedColumn()
    declare id: number

    @Column()
    declare edition_id: number

    @Column({ type: 'varchar', length: 20 })
    declare role: NavRole

    // null = entró a la edición (primer clic)
    @Column({ type: 'varchar', length: 30, nullable: true })
    declare from_section: EditionSection | null

    @Column({ type: 'varchar', length: 30 })
    declare to_section: EditionSection

    // Id al azar de la pestaña del panel: separa a un juez muy activo del resto sin saber quién es (null = antes de guardarlo)
    @Column({ type: 'uuid', nullable: true })
    declare session_id: string | null

    // Fase del concurso en ese momento: el uso cambia al prepararlo, durante y al cerrar
    @Column({ type: 'varchar', length: 20 })
    declare edition_status: string

    @CreateDateColumn({ type: 'timestamptz' })
    declare created_at: Date
}
