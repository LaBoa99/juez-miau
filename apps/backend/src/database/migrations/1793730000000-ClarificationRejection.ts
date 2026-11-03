import { MigrationInterface, QueryRunner } from "typeorm";

// El staff puede rechazar una aclaración (contenido indebido o que revela una respuesta)
export class ClarificationRejection1793730000000 implements MigrationInterface {
    name = 'ClarificationRejection1793730000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clarification" ADD "rejected_at" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clarification" DROP COLUMN "rejected_at"`);
    }

}
