-- AlterTable
ALTER TABLE "Draft" ALTER COLUMN "additionalLinks" SET DEFAULT '[]'::jsonb;

-- CreateIndex
CREATE INDEX "CourseDraft_userId_idx" ON "CourseDraft"("userId");

-- CreateIndex
CREATE INDEX "Draft_userId_idx" ON "Draft"("userId");

-- CreateIndex
CREATE INDEX "Purchase_createdAt_idx" ON "Purchase"("createdAt");

-- CreateIndex
CREATE INDEX "UserLesson_userId_idx" ON "UserLesson"("userId");
