import { MigrationInterface, QueryRunner } from "typeorm";

// Los jueces proponen problemas (ready) y el admin los acepta (published).
// La letra se asigna al iniciar el concurso, así que puede ser null antes
export class ProblemApproval1793740000000 implements MigrationInterface {
    name = 'ProblemApproval1793740000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."problem_status_enum" ADD VALUE IF NOT EXISTS 'ready' BEFORE 'published'`);
        await queryRunner.query(`ALTER TABLE "problem" ALTER COLUMN "letter" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`UPDATE "problem" SET "status" = 'draft' WHERE "status" = 'ready'`);
        await queryRunner.query(`ALTER TABLE "problem" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TYPE "public"."problem_status_enum" RENAME TO "problem_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."problem_status_enum" AS ENUM('draft', 'published')`);
        await queryRunner.query(`ALTER TABLE "problem" ALTER COLUMN "status" TYPE "public"."problem_status_enum" USING "status"::text::"public"."problem_status_enum"`);
        await queryRunner.query(`ALTER TABLE "problem" ALTER COLUMN "status" SET DEFAULT 'draft'`);
        await queryRunner.query(`DROP TYPE "public"."problem_status_enum_old"`);
        await queryRunner.query(`UPDATE "problem" SET "letter" = '?' || "id" WHERE "letter" IS NULL`);
        await queryRunner.query(`ALTER TABLE "problem" ALTER COLUMN "letter" SET NOT NULL`);
    }

}
