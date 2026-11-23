import { MigrationInterface, QueryRunner } from "typeorm";

// El salón es solo el lugar físico: puede tener equipos de varias categorías y la que manda es la del equipo
export class RoomWithoutCategory1793790000000 implements MigrationInterface {
    name = 'RoomWithoutCategory1793790000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // RoomCategories pasa estos datos a room_category y borra la tabla temporal
        await queryRunner.query(`CREATE TABLE "room_category_legacy" AS SELECT "id" AS "room_id", "category_id" FROM "room" WHERE "category_id" IS NOT NULL`);
        await queryRunner.query(`ALTER TABLE "room" DROP CONSTRAINT "FK_f4f2ee1b5d223a50dd25922773a"`);
        await queryRunner.query(`ALTER TABLE "room" DROP COLUMN "category_id"`);
    }

    // La columna vuelve vacía: la categoría que tenía cada salón no se puede recuperar
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "room_category_legacy"`);
        await queryRunner.query(`ALTER TABLE "room" ADD "category_id" integer`);
        await queryRunner.query(`ALTER TABLE "room" ADD CONSTRAINT "FK_f4f2ee1b5d223a50dd25922773a" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
