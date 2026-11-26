import { MigrationInterface, QueryRunner } from "typeorm";

// Intentos de abrir un programa prohibido mientras su alerta sigue abierta (cada uno suma 0.3 de penalización)
export class FlagAttempts1793860000000 implements MigrationInterface {
    name = 'FlagAttempts1793860000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "flag" ADD "attempts" integer NOT NULL DEFAULT '1'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "flag" DROP COLUMN "attempts"`);
    }
}
