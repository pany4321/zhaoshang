-- CreateTable
CREATE TABLE "JudicialCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enterpriseId" TEXT NOT NULL,
    "title" TEXT,
    "caseCode" TEXT,
    "caseReason" TEXT,
    "partyRole" TEXT,
    "procedure" TEXT,
    "trialTime" TEXT,
    "typeTags" TEXT,
    CONSTRAINT "JudicialCase_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "JudicialCase_enterpriseId_idx" ON "JudicialCase"("enterpriseId");
