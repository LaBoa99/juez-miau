import { MigrationInterface, QueryRunner } from "typeorm";

// Copia cifrada (recuperable) de la contraseña del staff, como la del equipo, para el PDF de credenciales.
// Nula para las cuentas creadas antes: no se puede recuperar hasta generarles una nueva
export class StaffPasswordEncrypted1793780000000 implements MigrationInterface {
    name = 'StaffPasswordEncrypted1793780000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "staff_user" ADD "password" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "staff_user" DROP COLUMN "password"`);
    }

}
