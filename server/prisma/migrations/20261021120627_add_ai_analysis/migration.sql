-- CreateTable
CREATE TABLE "AiAnalysis" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "enterpriseId" TEXT,
    "policyId" TEXT,
    "summary" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiAnalysis_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AiAnalysis_enterpriseId_type_idx" ON "AiAnalysis"("enterpriseId", "type");

-- CreateIndex
CREATE INDEX "AiAnalysis_policyId_idx" ON "AiAnalysis"("policyId");

-- CreateIndex
CREATE INDEX "AiAnalysis_createdAt_idx" ON "AiAnalysis"("createdAt");
