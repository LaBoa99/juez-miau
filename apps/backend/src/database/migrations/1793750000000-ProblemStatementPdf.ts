import { MigrationInterface, QueryRunner } from "typeorm";

// El enunciado puede ser un PDF (blob) en vez de markdown
export class ProblemStatementPdf1793750000000 implements MigrationInterface {
    name = 'ProblemStatementPdf1793750000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "problem" ADD "statement_pdf_sha" character(64)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "problem" DROP COLUMN "statement_pdf_sha"`);
    }

}
