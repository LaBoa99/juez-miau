import { MigrationInterface, QueryRunner } from "typeorm";

// La dificultad la da el salón/categoría (Básico, Intermedio, Avanzado), no un campo del problema
export class DropProblemDifficulty1793710000000 implements MigrationInterface {
    name = 'DropProblemDifficulty1793710000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "problem" DROP COLUMN "difficulty"`);
        await queryRunner.query(`DROP TYPE "public"."problem_difficulty_enum"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."problem_difficulty_enum" AS ENUM('easy', 'medium', 'hard')`);
        await queryRunner.query(`ALTER TABLE "problem" ADD "difficulty" "public"."problem_difficulty_enum" NOT NULL DEFAULT 'medium'`);
    }

}
