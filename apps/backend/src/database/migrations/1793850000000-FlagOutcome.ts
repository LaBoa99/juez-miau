import { MigrationInterface, QueryRunner } from "typeorm";

// Decisión del juez sobre cada alerta (confirmada suma minutos), última vez que se detectó,
// número de falta (reincidencia) y alerta por cerrar sesión durante el concurso
export class FlagOutcome1793850000000 implements MigrationInterface {
    name = 'FlagOutcome1793850000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."flag_outcome_enum" AS ENUM('CONFIRMED', 'DISMISSED')`);
        await queryRunner.query(`ALTER TABLE "flag" ADD "outcome" "public"."flag_outcome_enum"`);
        await queryRunner.query(`ALTER TABLE "flag" ADD "outcome_contest_ms" integer`);
        await queryRunner.query(`ALTER TABLE "flag" ADD "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "flag" ADD "offense" integer NOT NULL DEFAULT '1'`);
        await queryRunner.query(`ALTER TYPE "public"."flag_type_enum" ADD VALUE 'SESSION_CLOSED'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "flag" WHERE "type" = 'SESSION_CLOSED'`);
        await queryRunner.query(`DROP INDEX "public"."IDX_491004fd5b84c1e0812bb37597"`);
        await queryRunner.query(`CREATE TYPE "public"."flag_type_enum_old" AS ENUM('SESSION_REPLACED', 'FORBIDDEN_PROCESS', 'HEARTBEAT_LOST', 'MANUAL', 'EXTRA_MONITOR', 'USB_STORAGE', 'NETWORK_CHANGE')`);
        await queryRunner.query(`ALTER TABLE "flag" ALTER COLUMN "type" TYPE "public"."flag_type_enum_old" USING "type"::"text"::"public"."flag_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."flag_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."flag_type_enum_old" RENAME TO "flag_type_enum"`);
        await queryRunner.query(`CREATE INDEX "IDX_491004fd5b84c1e0812bb37597" ON "flag" USING btree ("team_id", "type", "resolved_at") `);
        await queryRunner.query(`ALTER TABLE "flag" DROP COLUMN "offense"`);
        await queryRunner.query(`ALTER TABLE "flag" DROP COLUMN "last_seen_at"`);
        await queryRunner.query(`ALTER TABLE "flag" DROP COLUMN "outcome_contest_ms"`);
        await queryRunner.query(`ALTER TABLE "flag" DROP COLUMN "outcome"`);
        await queryRunner.query(`DROP TYPE "public"."flag_outcome_enum"`);
    }

}
