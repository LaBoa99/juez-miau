import { MigrationInterface, QueryRunner } from "typeorm";

// Borrar un equipo borra a sus integrantes, y borrar una edición (solo en borrador) borra sus equipos.
// Antes las dos cosas fallaban con 500 por estas llaves
const KEYS = [
    { table: 'team_member', name: 'FK_a1b5b4f5fa1b7f890d0a278748b', column: 'team_id', ref: 'team' },
    { table: 'team', name: 'FK_8454c396fedb6caf02eb28dbfbb', column: 'edition_id', ref: 'edition' },
]

export class TeamMemberCascade1793770000000 implements MigrationInterface {
    name = 'TeamMemberCascade1793770000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        for (const k of KEYS) await this.setOnDelete(queryRunner, k, 'CASCADE')
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const k of KEYS) await this.setOnDelete(queryRunner, k, 'NO ACTION')
    }

    private async setOnDelete(queryRunner: QueryRunner, k: typeof KEYS[number], action: string): Promise<void> {
        await queryRunner.query(`ALTER TABLE "${k.table}" DROP CONSTRAINT "${k.name}"`);
        await queryRunner.query(`ALTER TABLE "${k.table}" ADD CONSTRAINT "${k.name}" FOREIGN KEY ("${k.column}") REFERENCES "${k.ref}"("id") ON DELETE ${action} ON UPDATE NO ACTION`);
    }

}
