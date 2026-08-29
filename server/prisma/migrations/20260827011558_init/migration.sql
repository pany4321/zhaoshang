-- CreateTable
CREATE TABLE "District" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Industry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'worker',
    "districtId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Enterprise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "creditCode" TEXT NOT NULL,
    "legal" TEXT NOT NULL,
    "found" TEXT NOT NULL,
    "scale" TEXT NOT NULL,
    "bizStatus" TEXT NOT NULL,
    "creditStatus" TEXT NOT NULL,
    "regCapital" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "industryId" TEXT NOT NULL,
    "isKey" BOOLEAN NOT NULL DEFAULT false,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "newDate" TEXT,
    "revenue" REAL NOT NULL DEFAULT 0,
    "tax" REAL NOT NULL DEFAULT 0,
    "investment" REAL NOT NULL DEFAULT 0,
    "employees" INTEGER NOT NULL DEFAULT 0,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Enterprise_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Enterprise_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shareholder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "enterpriseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ratio" REAL NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Shareholder_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiskEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "dimensionName" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "foundDate" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "taskId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskEvent_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RiskEvent_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RiskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "finishedAt" TEXT,
    "description" TEXT,
    "processLog" TEXT,
    "enterpriseId" TEXT,
    "projectId" TEXT,
    "assignee" TEXT NOT NULL,
    "source" TEXT,
    CONSTRAINT "Task_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "stageName" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 5,
    "investment" REAL NOT NULL DEFAULT 0,
    "districtId" TEXT NOT NULL,
    "industryId" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "contact" TEXT,
    "riskLevel" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "startDate" TEXT NOT NULL,
    "stage1Detail" TEXT,
    "stage2Detail" TEXT,
    "stage3Detail" TEXT,
    "stage4Detail" TEXT,
    "stage5Detail" TEXT,
    "stage6Detail" TEXT,
    "lastContact" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "dept" TEXT NOT NULL,
    "publishDate" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "support" TEXT NOT NULL,
    "materials" TEXT NOT NULL,
    "hot" INTEGER NOT NULL DEFAULT 0,
    "industryId" TEXT,
    "amount" REAL NOT NULL DEFAULT 0,
    "redeemed" REAL NOT NULL DEFAULT 0,
    "helpedEnts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Policy_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "agentType" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "messages" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Enterprise_creditCode_key" ON "Enterprise"("creditCode");

-- CreateIndex
CREATE UNIQUE INDEX "RiskEvent_taskId_key" ON "RiskEvent"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_enterpriseId_key" ON "Project"("enterpriseId");

-- CreateIndex
CREATE INDEX "AiConversation_agentType_username_idx" ON "AiConversation"("agentType", "username");
