import { MigrationInterface, QueryRunner } from "typeorm";

export class ProblemDifficulty1793700000000 implements MigrationInterface {
    name = 'ProblemDifficulty1793700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."problem_difficulty_enum" AS ENUM('easy', 'medium', 'hard')`);
        await queryRunner.query(`ALTER TABLE "problem" ADD "difficulty" "public"."problem_difficulty_enum" NOT NULL DEFAULT 'medium'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "problem" DROP COLUMN "difficulty"`);
        await queryRunner.query(`DROP TYPE "public"."problem_difficulty_enum"`);
    }

}
