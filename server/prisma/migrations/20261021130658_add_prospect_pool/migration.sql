-- CreateTable
CREATE TABLE "ProspectEnterprise" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "creditCode" TEXT,
    "province" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "industryL1" TEXT,
    "industryL2" TEXT,
    "regCapital" REAL NOT NULL DEFAULT 0,
    "foundDate" TEXT,
    "bizScope" TEXT,
    "source" TEXT NOT NULL DEFAULT 'company_industry',
    "recommended" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ProspectEnterprise_creditCode_key" ON "ProspectEnterprise"("creditCode");

-- CreateIndex
CREATE INDEX "ProspectEnterprise_industryL2_idx" ON "ProspectEnterprise"("industryL2");

-- CreateIndex
CREATE INDEX "ProspectEnterprise_province_idx" ON "ProspectEnterprise"("province");

-- CreateIndex
CREATE INDEX "ProspectEnterprise_recommended_idx" ON "ProspectEnterprise"("recommended");
