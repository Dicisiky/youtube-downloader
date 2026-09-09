-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- AlterTable: RecordingJob gets a nullable visibility snapshot column
ALTER TABLE "RecordingJob" ADD COLUMN "uploadedVisibility" "Visibility";

-- AlterTable: User gets "role", backfilled from the existing "isAdmin" boolean
-- before that column is dropped, so no existing account's admin status is lost.
ALTER TABLE "User" ADD COLUMN "role" "UserRole";

UPDATE "User" SET "role" = CASE WHEN "isAdmin" THEN 'ADMIN'::"UserRole" ELSE 'USER'::"UserRole" END;

ALTER TABLE "User" ALTER COLUMN "role" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';

ALTER TABLE "User" DROP COLUMN "isAdmin";
