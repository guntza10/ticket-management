/*
  Warnings:

  - The `status` column on the `ticket` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `senderEmail` to the `ticket` table without a default value. This is not possible if the table is not empty.
  - Added the required column `senderName` to the `ticket` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('open', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('general_question', 'technical_question', 'refund_request');

-- AlterTable
ALTER TABLE "ticket" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "bodyHtml" TEXT,
ADD COLUMN     "category" "TicketCategory",
ADD COLUMN     "senderEmail" TEXT NOT NULL,
ADD COLUMN     "senderName" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "TicketStatus" NOT NULL DEFAULT 'open';

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
