import { MigrationInterface, QueryRunner } from "typeorm";

export class IntegrityHardware1793299817468 implements MigrationInterface {
    name = 'IntegrityHardware1793299817468'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "team_session" ADD "network_baseline" text`);
        await queryRunner.query(`ALTER TABLE "edition" ADD "max_monitors" integer DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "edition" ADD "watch_usb_storage" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "edition" ADD "watch_network" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`DROP INDEX "public"."IDX_491004fd5b84c1e0812bb37597"`);
        await queryRunner.query(`ALTER TYPE "public"."flag_type_enum" ADD VALUE 'EXTRA_MONITOR'`);
        await queryRunner.query(`ALTER TYPE "public"."flag_type_enum" ADD VALUE 'USB_STORAGE'`);
        await queryRunner.query(`ALTER TYPE "public"."flag_type_enum" ADD VALUE 'NETWORK_CHANGE'`);
        await queryRunner.query(`CREATE INDEX "IDX_491004fd5b84c1e0812bb37597" ON "flag"  ("team_id", "type", "resolved_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_491004fd5b84c1e0812bb37597"`);
        await queryRunner.query(`CREATE TYPE "public"."flag_type_enum_old" AS ENUM('SESSION_REPLACED', 'FORBIDDEN_PROCESS', 'HEARTBEAT_LOST', 'MANUAL')`);
        await queryRunner.query(`ALTER TABLE "flag" ALTER COLUMN "type" TYPE "public"."flag_type_enum_old" USING "type"::"text"::"public"."flag_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."flag_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."flag_type_enum_old" RENAME TO "flag_type_enum"`);
        await queryRunner.query(`CREATE INDEX "IDX_491004fd5b84c1e0812bb37597" ON "flag" USING btree ("team_id", "type", "resolved_at") `);
        await queryRunner.query(`ALTER TABLE "edition" DROP COLUMN "watch_network"`);
        await queryRunner.query(`ALTER TABLE "edition" DROP COLUMN "watch_usb_storage"`);
        await queryRunner.query(`ALTER TABLE "edition" DROP COLUMN "max_monitors"`);
        await queryRunner.query(`ALTER TABLE "team_session" DROP COLUMN "network_baseline"`);
    }

}
