import { MigrationInterface, QueryRunner } from "typeorm";

// Id anónimo de la pestaña en la prueba de calor de la barra: separa a cada juez sin guardar quién es
export class NavEventSession1793870000000 implements MigrationInterface {
    name = 'NavEventSession1793870000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "nav_event" ADD "session_id" uuid`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "nav_event" DROP COLUMN "session_id"`);
    }
}
