import { MigrationInterface, QueryRunner } from "typeorm";

// Equipos sin salón: si su categoría tiene un solo salón en la edición, ese es el suyo
export class TeamRoomFromCategory1793760000000 implements MigrationInterface {
    name = 'TeamRoomFromCategory1793760000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "team" t SET "room_id" = r."id"
            FROM "room" r
            WHERE t."room_id" IS NULL
              AND r."edition_id" = t."edition_id"
              AND r."category_id" = t."category_id"
              AND (SELECT count(*) FROM "room" r2 WHERE r2."edition_id" = r."edition_id" AND r2."category_id" = r."category_id") = 1
        `);
    }

    // Solo rellena datos; no se puede saber cuáles eran null
    public async down(): Promise<void> {}

}
