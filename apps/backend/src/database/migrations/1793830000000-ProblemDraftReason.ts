import { MigrationInterface, QueryRunner } from "typeorm";

// Por qué un problema regresó a borrador (lo lee su autor)
export class ProblemDraftReason1793830000000 implements MigrationInterface {
    name = 'ProblemDraftReason1793830000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "problem" ADD "draft_reason" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "problem" DROP COLUMN "draft_reason"`);
    }

}
