import { MigrationInterface, QueryRunner } from "typeorm";

// Historial de revisiones manuales y salida/código de salida por caso (detalle de caso del staff)
export class SubmissionReviewsAndCaseOutput1793720000000 implements MigrationInterface {
    name = 'SubmissionReviewsAndCaseOutput1793720000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."submission_review_verdict_enum" AS ENUM('AC', 'WA', 'TLE', 'MLE', 'RE', 'CE', 'PENDING_REVIEW')`);
        await queryRunner.query(`CREATE TABLE "submission_review" ("id" SERIAL NOT NULL, "submission_id" integer NOT NULL, "verdict" "public"."submission_review_verdict_enum" NOT NULL, "reviewed_by" integer NOT NULL, "comment" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c3b53d733895bbd468beba4ecfd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e357aa226423021b1dca90be6a" ON "submission_review" ("submission_id") `);
        await queryRunner.query(`ALTER TABLE "submission_case" ADD "exit_code" integer`);
        await queryRunner.query(`ALTER TABLE "submission_case" ADD "output" text`);
        await queryRunner.query(`ALTER TABLE "submission_review" ADD CONSTRAINT "FK_e357aa226423021b1dca90be6a7" FOREIGN KEY ("submission_id") REFERENCES "submission"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        // Las revisiones ya hechas quedan como primera entrada del historial
        await queryRunner.query(`INSERT INTO "submission_review" ("submission_id", "verdict", "reviewed_by", "comment", "created_at")
            SELECT "id", "verdict"::text::"public"."submission_review_verdict_enum", "reviewed_by", "review_comment", "reviewed_at"
            FROM "submission" WHERE "reviewed_by" IS NOT NULL AND "reviewed_at" IS NOT NULL AND "verdict" IS NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "submission_review" DROP CONSTRAINT "FK_e357aa226423021b1dca90be6a7"`);
        await queryRunner.query(`ALTER TABLE "submission_case" DROP COLUMN "output"`);
        await queryRunner.query(`ALTER TABLE "submission_case" DROP COLUMN "exit_code"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e357aa226423021b1dca90be6a"`);
        await queryRunner.query(`DROP TABLE "submission_review"`);
        await queryRunner.query(`DROP TYPE "public"."submission_review_verdict_enum"`);
    }
}
