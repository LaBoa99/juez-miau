import { MigrationInterface, QueryRunner } from "typeorm";

// El token de proyector nunca se validó: el proyector es público por edición (/proyector/:editionId)
export class DropProjectorToken1793810000000 implements MigrationInterface {
    name = 'DropProjectorToken1793810000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "room" DROP COLUMN "projector_token_hash"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "room" ADD "projector_token_hash" character varying(64)`);
        await queryRunner.query(`ALTER TABLE "room" ADD CONSTRAINT "UQ_1b18eccee46a6b879c691f570ef" UNIQUE ("projector_token_hash")`);
    }

}
