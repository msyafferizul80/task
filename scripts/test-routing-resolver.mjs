import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Replicate the pure resolver logic for NodeJS execution
const RECRUITMENT_INTERNAL_OVERRIDE_GROUP_ID = "-1004461542862";

function resolveTaskTelegramGroup(task, deptGroupMap, fallbackChatId = "") {
  if (task.department === "Recruitment" && task.is_internal) {
    return RECRUITMENT_INTERNAL_OVERRIDE_GROUP_ID;
  }
  if (task.department && deptGroupMap[task.department]) {
    return deptGroupMap[task.department];
  }
  return fallbackChatId;
}

console.log("==================================================");
console.log("RUNNING ROUTING RESOLVER & DIGEST UNIT TESTS");
console.log("==================================================");

const mockDeptGroupMap = {
  "Recruitment": "-1001567997515",
  "Graphic": "-1002233445566",
  "Outsourcing": "-1003344556677",
};
const FALLBACK_CHAT_ID = "-1009999999999";

// Test 1: Recruitment + is_internal: true -> Override Group ID
console.log("\n[Test 1] Recruitment task for internal customer (is_internal: true)...");
const res1 = resolveTaskTelegramGroup(
  { department: "Recruitment", is_internal: true, customer_name: "SYAZNA WORLD (INTERNAL)" },
  mockDeptGroupMap,
  FALLBACK_CHAT_ID
);
assert.equal(res1, "-1004461542862", "Must route to Internal SW group");
console.log("  PASS: Correctly resolved to", res1);

// Test 2: Recruitment + is_internal: false -> Standard Recruitment Group ID
console.log("\n[Test 2] Recruitment task for external customer (is_internal: false)...");
const res2 = resolveTaskTelegramGroup(
  { department: "Recruitment", is_internal: false, customer_name: "External Client Ltd" },
  mockDeptGroupMap,
  FALLBACK_CHAT_ID
);
assert.equal(res2, "-1001567997515", "Must route to SW Recruiter group");
console.log("  PASS: Correctly resolved to", res2);

// Test 3: Other department (Graphic) + is_internal: true -> Graphic Group ID
console.log("\n[Test 3] Graphic task for internal customer (is_internal: true)...");
const res3 = resolveTaskTelegramGroup(
  { department: "Graphic", is_internal: true, customer_name: "SYAZNA WORLD (INTERNAL)" },
  mockDeptGroupMap,
  FALLBACK_CHAT_ID
);
assert.equal(res3, "-1002233445566", "Must route to Graphic department group");
console.log("  PASS: Correctly resolved to", res3);

// Test 4: Other department (Graphic) + is_internal: false -> Graphic Group ID
console.log("\n[Test 4] Graphic task for external customer (is_internal: false)...");
const res4 = resolveTaskTelegramGroup(
  { department: "Graphic", is_internal: false, customer_name: "External Client Ltd" },
  mockDeptGroupMap,
  FALLBACK_CHAT_ID
);
assert.equal(res4, "-1002233445566", "Must route to Graphic department group");
console.log("  PASS: Correctly resolved to", res4);

// Test 5: Unconfigured department -> Fallback Chat ID
console.log("\n[Test 5] Unconfigured department task...");
const res5 = resolveTaskTelegramGroup(
  { department: "NonExistentDept", is_internal: false },
  mockDeptGroupMap,
  FALLBACK_CHAT_ID
);
assert.equal(res5, FALLBACK_CHAT_ID, "Must route to fallback global chat ID");
console.log("  PASS: Correctly resolved to", res5);

// Test 6: Digest grouping simulation
console.log("\n[Test 6] Digest grouping simulation with mixed tasks...");
const mockUntrackedTasks = [
  { id: "1", title: "Internal Recruitment Task", department: "Recruitment", is_internal: true, assignee: { full_name: "Megat" } },
  { id: "2", title: "External Recruitment Task", department: "Recruitment", is_internal: false, assignee: { full_name: "Megat" } },
  { id: "3", title: "Internal Graphic Task", department: "Graphic", is_internal: true, assignee: { full_name: "Siti" } },
];

const groupsData = {};
mockUntrackedTasks.forEach(task => {
  const targetChatId = resolveTaskTelegramGroup(task, mockDeptGroupMap, FALLBACK_CHAT_ID);
  const pic = task.assignee?.full_name || "Unassigned";
  if (!groupsData[targetChatId]) {
    groupsData[targetChatId] = { pics: {}, departments: new Set() };
  }
  if (task.department) {
    groupsData[targetChatId].departments.add(task.department);
  }
  if (!groupsData[targetChatId].pics[pic]) {
    groupsData[targetChatId].pics[pic] = [];
  }
  groupsData[targetChatId].pics[pic].push(task.title);
});

// Verify groupsData contains 3 separate chat IDs
assert.ok(groupsData["-1004461542862"], "Internal SW group must receive a digest");
assert.ok(groupsData["-1001567997515"], "SW Recruiter group must receive a digest");
assert.ok(groupsData["-1002233445566"], "Graphic group must receive a digest");

assert.deepEqual(groupsData["-1004461542862"].pics["Megat"], ["Internal Recruitment Task"]);
assert.deepEqual(groupsData["-1001567997515"].pics["Megat"], ["External Recruitment Task"]);
assert.deepEqual(groupsData["-1002233445566"].pics["Siti"], ["Internal Graphic Task"]);

console.log("  PASS: Internal Recruitment Task successfully routed to Internal SW group (-1004461542862) digest!");
console.log("  PASS: External Recruitment Task successfully routed to SW Recruiter group (-1001567997515) digest!");
console.log("  PASS: Graphic Task successfully routed to Graphic group (-1002233445566) digest!");

// Test 7: Codebase audit for leftover hardcoded string checks in edge functions
console.log("\n[Test 7] Auditing supabase/functions directory for hardcoded customer name checks...");
const functionsDir = path.resolve(__dirname, "../supabase/functions");

function checkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      checkDir(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) {
      const content = fs.readFileSync(fullPath, "utf-8");
      if (content.includes("SYAZNA WORLD (INTERNAL)")) {
        throw new Error(`Found hardcoded string in file: ${fullPath}`);
      }
    }
  }
}

checkDir(functionsDir);
console.log("  PASS: Zero hardcoded 'SYAZNA WORLD (INTERNAL)' occurrences found in supabase/functions!");

console.log("\n==================================================");
console.log("ALL TESTS PASSED SUCCESSFULLY! (7/7)");
console.log("==================================================");
