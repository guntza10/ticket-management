-- CreateEnum
CREATE TYPE "Role" AS ENUM ('agent', 'admin');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'agent';
