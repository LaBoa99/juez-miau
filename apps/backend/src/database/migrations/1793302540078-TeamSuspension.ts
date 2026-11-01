import { MigrationInterface, QueryRunner } from "typeorm";

export class TeamSuspension1793302540078 implements MigrationInterface {
    name = 'TeamSuspension1793302540078'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "team" ADD "suspended_at" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "team" DROP COLUMN "suspended_at"`);
    }

}
