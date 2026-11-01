import { MigrationInterface, QueryRunner } from "typeorm";

export class Clarifications1793300550698 implements MigrationInterface {
    name = 'Clarifications1793300550698'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "clarification" ("id" SERIAL NOT NULL, "edition_id" integer NOT NULL, "team_id" integer NOT NULL, "problem_id" integer, "question" text NOT NULL, "answer" text, "answered_by" integer, "answered_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_dc58e35c9d3bb8bdf64040462a2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c268d2856a1ecf3a048b81032f" ON "clarification"  ("edition_id", "answered_at") `);
        await queryRunner.query(`ALTER TABLE "clarification" ADD CONSTRAINT "FK_a9787fb02afbd8292dc2fd1aade" FOREIGN KEY ("edition_id") REFERENCES "edition"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "clarification" ADD CONSTRAINT "FK_c17b9d9dc91455bf8773e7ec298" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "clarification" ADD CONSTRAINT "FK_d79543619fe46c875038c9878f8" FOREIGN KEY ("problem_id") REFERENCES "problem"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clarification" DROP CONSTRAINT "FK_d79543619fe46c875038c9878f8"`);
        await queryRunner.query(`ALTER TABLE "clarification" DROP CONSTRAINT "FK_c17b9d9dc91455bf8773e7ec298"`);
        await queryRunner.query(`ALTER TABLE "clarification" DROP CONSTRAINT "FK_a9787fb02afbd8292dc2fd1aade"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c268d2856a1ecf3a048b81032f"`);
        await queryRunner.query(`DROP TABLE "clarification"`);
    }

}
