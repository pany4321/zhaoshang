-- CreateTable
CREATE TABLE "EnterpriseRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enterpriseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "occurDate" TEXT,
    "amount" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnterpriseRecord_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EnterpriseRecord_enterpriseId_type_idx" ON "EnterpriseRecord"("enterpriseId", "type");

-- CreateIndex
CREATE INDEX "EnterpriseRecord_type_idx" ON "EnterpriseRecord"("type");
