import { MigrationInterface, QueryRunner } from "typeorm";

export class ProblemAuthor1793495657445 implements MigrationInterface {
    name = 'ProblemAuthor1793495657445'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "problem" ADD "created_by" integer`);
        // Los problemas que ya existen toman como autor a quien creó su versión 1 de casos
        await queryRunner.query(`UPDATE "problem" p SET "created_by" = t."author_id" FROM "testset" t WHERE t."problem_id" = p."id" AND t."version" = 1`);
        await queryRunner.query(`ALTER TABLE "problem" ADD CONSTRAINT "FK_46c0c4b6422ac4853385d37a89a" FOREIGN KEY ("created_by") REFERENCES "staff_user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "problem" DROP CONSTRAINT "FK_46c0c4b6422ac4853385d37a89a"`);
        await queryRunner.query(`ALTER TABLE "problem" DROP COLUMN "created_by"`);
    }

}
