import { MigrationInterface, QueryRunner } from "typeorm";

// Categoría especial de programa completo (docs/design/programa-completo.md)
export class FullProgramCategory1793800000000 implements MigrationInterface {
    name = 'FullProgramCategory1793800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "category" ADD "full_program" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TYPE "public"."testset_compare_mode_enum" ADD VALUE 'program'`);
    }

    // Postgres no quita valores de un enum: los testsets en 'program' regresan a 'exact' y el tipo se recrea
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "testset" ALTER COLUMN "compare_mode" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "testset" ALTER COLUMN "compare_mode" TYPE text`);
        await queryRunner.query(`UPDATE "testset" SET "compare_mode" = 'exact' WHERE "compare_mode" = 'program'`);
        await queryRunner.query(`DROP TYPE "public"."testset_compare_mode_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."testset_compare_mode_enum" AS ENUM('exact', 'tolerance', 'checker')`);
        await queryRunner.query(`ALTER TABLE "testset" ALTER COLUMN "compare_mode" TYPE "public"."testset_compare_mode_enum" USING "compare_mode"::"public"."testset_compare_mode_enum"`);
        await queryRunner.query(`ALTER TABLE "testset" ALTER COLUMN "compare_mode" SET DEFAULT 'exact'`);
        await queryRunner.query(`ALTER TABLE "category" DROP COLUMN "full_program"`);
    }

}
