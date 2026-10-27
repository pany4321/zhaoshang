-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Enterprise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "creditCode" TEXT NOT NULL,
    "legal" TEXT NOT NULL,
    "found" TEXT NOT NULL,
    "scale" TEXT NOT NULL,
    "bizStatus" TEXT NOT NULL,
    "creditStatus" TEXT NOT NULL,
    "regCapital" TEXT NOT NULL,
    "districtId" TEXT,
    "industryId" TEXT,
    "isKey" BOOLEAN NOT NULL DEFAULT false,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "newDate" TEXT,
    "revenue" REAL NOT NULL DEFAULT 0,
    "tax" REAL,
    "investment" REAL NOT NULL DEFAULT 0,
    "employees" INTEGER,
    "landMu" REAL NOT NULL DEFAULT 0,
    "performRate" INTEGER NOT NULL DEFAULT 90,
    "commitRate" INTEGER,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "riskLevel" TEXT NOT NULL DEFAULT 'blue',
    "riskOp" REAL NOT NULL DEFAULT 0,
    "riskFin" REAL NOT NULL DEFAULT 0,
    "riskLegal" REAL NOT NULL DEFAULT 0,
    "riskCredit" REAL NOT NULL DEFAULT 0,
    "riskTender" REAL NOT NULL DEFAULT 0,
    "riskTax" REAL NOT NULL DEFAULT 0,
    "riskCommit" REAL NOT NULL DEFAULT 0,
    "riskIp" REAL NOT NULL DEFAULT 0,
    "patentCount" INTEGER NOT NULL DEFAULT 0,
    "inventionCount" INTEGER NOT NULL DEFAULT 0,
    "trademarkCount" INTEGER NOT NULL DEFAULT 0,
    "judicialCount" INTEGER NOT NULL DEFAULT 0,
    "zhixingCount" INTEGER NOT NULL DEFAULT 0,
    "shixinCount" INTEGER NOT NULL DEFAULT 0,
    "bidCount" INTEGER NOT NULL DEFAULT 0,
    "assetTotal" REAL,
    "netProfit" REAL,
    "finYear" TEXT,
    "nationalIndustryL1" TEXT,
    "nationalIndustry" TEXT,
    "nationalIndustryL3" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Enterprise_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Enterprise_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Enterprise" ("assetTotal", "bidCount", "bizStatus", "commitRate", "createdAt", "creditCode", "creditStatus", "districtId", "employees", "finYear", "found", "id", "industryId", "inventionCount", "investment", "isKey", "isNew", "judicialCount", "landMu", "legal", "name", "nationalIndustry", "nationalIndustryL1", "nationalIndustryL3", "netProfit", "newDate", "patentCount", "performRate", "regCapital", "revenue", "riskCommit", "riskCredit", "riskFin", "riskIp", "riskLegal", "riskLevel", "riskOp", "riskScore", "riskTax", "riskTender", "scale", "shixinCount", "tax", "trademarkCount", "updatedAt", "zhixingCount") SELECT "assetTotal", "bidCount", "bizStatus", "commitRate", "createdAt", "creditCode", "creditStatus", "districtId", "employees", "finYear", "found", "id", "industryId", "inventionCount", "investment", "isKey", "isNew", "judicialCount", "landMu", "legal", "name", "nationalIndustry", "nationalIndustryL1", "nationalIndustryL3", "netProfit", "newDate", "patentCount", "performRate", "regCapital", "revenue", "riskCommit", "riskCredit", "riskFin", "riskIp", "riskLegal", "riskLevel", "riskOp", "riskScore", "riskTax", "riskTender", "scale", "shixinCount", "tax", "trademarkCount", "updatedAt", "zhixingCount" FROM "Enterprise";
DROP TABLE "Enterprise";
ALTER TABLE "new_Enterprise" RENAME TO "Enterprise";
CREATE UNIQUE INDEX "Enterprise_creditCode_key" ON "Enterprise"("creditCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
