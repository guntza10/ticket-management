-- Hand-edited. Prisma generated a single `ADD COLUMN "subjectNormalized" TEXT
-- NOT NULL` and refused to apply it, because the table already held rows and
-- that statement has no value to put in them. The three-step below is the
-- standard way to add a required column to a populated table: add it nullable,
-- fill it, then tighten the constraint.
--
-- The backfill is `lower("subject")` and that is exact rather than approximate:
-- the subject stored on a ticket has already had its reply prefixes stripped at
-- write time, so lower-casing it is precisely what the application would have
-- written for that row.

-- AlterTable
ALTER TABLE "ticket" ADD COLUMN "subjectNormalized" TEXT;

-- Backfill
UPDATE "ticket" SET "subjectNormalized" = lower("subject");

-- AlterTable
ALTER TABLE "ticket" ALTER COLUMN "subjectNormalized" SET NOT NULL;
