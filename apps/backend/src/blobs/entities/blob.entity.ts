import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

// Contenido direccionado por su sha256: entradas y salidas de casos de prueba.
// Inmutable; dos casos con el mismo contenido comparten la fila
@Entity('blob')
export class Blob {

    // sha256 en hexadecimal
    @PrimaryColumn({ type: 'char', length: 64 })
    declare sha: string

    @Column({ type: 'bytea' })
    declare bytes: Buffer

    @Column({ type: 'int' })
    declare size: number

    @CreateDateColumn({ type: 'timestamptz' })
    declare created_at: Date
}
