import { MigrationInterface, QueryRunner } from "typeorm";

// Clics en la barra de secciones de una edición (prueba de calor del orden)
export class NavEvents1793840000000 implements MigrationInterface {
    name = 'NavEvents1793840000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "nav_event" ("id" SERIAL NOT NULL, "edition_id" integer NOT NULL, "role" character varying(20) NOT NULL, "from_section" character varying(30), "to_section" character varying(30) NOT NULL, "edition_status" character varying(20) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a18b1df1337e2283921c19c1244" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f94373ea3b5ad637044ed28f97" ON "nav_event"  ("edition_id", "id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_f94373ea3b5ad637044ed28f97"`);
        await queryRunner.query(`DROP TABLE "nav_event"`);
    }

}
