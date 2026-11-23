import { MigrationInterface, QueryRunner } from "typeorm";

// Categorías de cada salón: solo proponen salón a los equipos nuevos (alta e importación del CSV)
export class RoomCategories1793820000000 implements MigrationInterface {
    name = 'RoomCategories1793820000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "room_category" ("room_id" integer NOT NULL, "category_id" integer NOT NULL, CONSTRAINT "PK_2a8264e2095f4c8eec90553fc19" PRIMARY KEY ("room_id", "category_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_8f8d28968f1aca338ad25789c5" ON "room_category"  ("room_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_92c6ea441aee2aad9d70405dc2" ON "room_category"  ("category_id") `);
        await queryRunner.query(`ALTER TABLE "room_category" ADD CONSTRAINT "FK_8f8d28968f1aca338ad25789c51" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "room_category" ADD CONSTRAINT "FK_92c6ea441aee2aad9d70405dc2f" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE CASCADE`);

        // Conserva la categoría que tenía cada salón (no existe en BD que ya pasaron RoomWithoutCategory sin esta copia)
        const [{ legacy }] = await queryRunner.query(`SELECT to_regclass('public.room_category_legacy') AS legacy`);
        if(legacy){
            await queryRunner.query(`INSERT INTO "room_category" ("room_id", "category_id")
                SELECT l."room_id", l."category_id" FROM "room_category_legacy" l
                JOIN "room" r ON r."id" = l."room_id"
                JOIN "category" c ON c."id" = l."category_id" AND c."edition_id" = r."edition_id"`);
            await queryRunner.query(`DROP TABLE "room_category_legacy"`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "room_category" DROP CONSTRAINT "FK_92c6ea441aee2aad9d70405dc2f"`);
        await queryRunner.query(`ALTER TABLE "room_category" DROP CONSTRAINT "FK_8f8d28968f1aca338ad25789c51"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_92c6ea441aee2aad9d70405dc2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8f8d28968f1aca338ad25789c5"`);
        await queryRunner.query(`DROP TABLE "room_category"`);
    }

}
