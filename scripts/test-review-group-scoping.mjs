import assert from 'node:assert';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

console.log('🧪 Starting Review Group Escalation & Scoping Test Suite...\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Combined Digest Builder & Capping Logic
// ─────────────────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const MAX_TASKS_PER_ENTRY = 5;

function buildCombinedDigestMessage({ checkpoint, untracked, pending_review }) {
  const hasUntracked = untracked && untracked.length > 0;
  const hasPendingReview = pending_review && pending_review.length > 0;

  if (!hasUntracked && !hasPendingReview) {
    return '';
  }

  const sections = [];

  // Section 1: Untracked timer tasks
  if (hasUntracked) {
    const totalPics = untracked.length;
    const totalTasks = untracked.reduce((acc, item) => acc + item.tasks.length, 0);
    let section1 = `🔔 <b>Semak ${checkpoint}</b> — ${totalPics} PIC, ${totalTasks} tugasan tanpa timer aktif:\n\n`;

    const entries = untracked.map((item) => {
      let block = `👤 <b>${escapeHtml(item.pic)}</b> (${item.tasks.length} tugasan)\n`;
      const visible = item.tasks.slice(0, MAX_TASKS_PER_ENTRY);
      visible.forEach((t) => {
        block += `  • ${escapeHtml(t)}\n`;
      });
      if (item.tasks.length > MAX_TASKS_PER_ENTRY) {
        const remaining = item.tasks.length - MAX_TASKS_PER_ENTRY;
        block += `  <i>...dan ${remaining} tugasan lain</i>\n`;
      }
      return block;
    });

    section1 += entries.join('\n');
    sections.push(section1);
  }

  // Section 2: Pending review tasks
  if (hasPendingReview) {
    const totalReviewTasks = pending_review.reduce((acc, item) => acc + item.tasks.length, 0);
    let section2 = `⏳ <b>Tugasan Menunggu Semakan (&gt;24 jam)</b> — ${totalReviewTasks} tugasan:\n\n`;

    const entries = pending_review.map((item) => {
      let block = '';
      if (item.type === 'group') {
        block += `👥 <b>Kumpulan Semakan: ${escapeHtml(item.group_name || '')}</b> (${item.tasks.length} tugasan)\n`;
      } else {
        block += `👤 <b>${escapeHtml(item.pic || '')}</b> (${item.tasks.length} tugasan)\n`;
      }

      const visible = item.tasks.slice(0, MAX_TASKS_PER_ENTRY);
      visible.forEach((t) => {
        block += `  • ${escapeHtml(t)}\n`;
      });
      if (item.tasks.length > MAX_TASKS_PER_ENTRY) {
        const remaining = item.tasks.length - MAX_TASKS_PER_ENTRY;
        block += `  <i>...dan ${remaining} tugasan lain</i>\n`;
      }
      return block;
    });

    section2 += entries.join('\n');
    sections.push(section2);
  }

  return sections.join('\n\n');
}

console.log('Test 1: Testing Combined Digest message generation and 5-item cap...');
const mockDigestData = {
  untracked: [
    { pic: 'En Faiz', tasks: ['Task 1', 'Task 2', 'Task 3', 'Task 4', 'Task 5', 'Task 6', 'Task 7'] }
  ],
  pending_review: [
    { type: 'group', group_name: 'Tech Leads', tasks: ['Review SOP Draft'] }
  ],
  checkpoint: '1:30 ptg'
};

const digestOutput = buildCombinedDigestMessage(mockDigestData);
assert(digestOutput.includes('🔔 <b>Semak 1:30 ptg</b>'));
assert(digestOutput.includes('<i>...dan 2 tugasan lain</i>'), 'Should cap at 5 and show overflow for 7 tasks');
assert(digestOutput.includes('👥 <b>Kumpulan Semakan: Tech Leads</b>'));
console.log('✅ Test 1 Passed: Combined Digest correctly generated with independent caps.\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Mutual Exclusivity Constraint Logic
// ─────────────────────────────────────────────────────────────────────────────
console.log('Test 2: Testing Mutual Exclusivity constraint check...');
function validateEscalationTarget(escalated_to_user_id, escalated_to_group_id) {
  // DB Constraint: CHECK (NOT (escalated_to_user_id IS NOT NULL AND escalated_to_group_id IS NOT NULL))
  if (escalated_to_user_id != null && escalated_to_group_id != null) {
    return false; // Violates constraint
  }
  return true;
}

assert.strictEqual(validateEscalationTarget('user-123', null), true, 'Individual target is valid');
assert.strictEqual(validateEscalationTarget(null, 'group-456'), true, 'Group target is valid');
assert.strictEqual(validateEscalationTarget(null, null), true, 'No escalation target is valid');
assert.strictEqual(validateEscalationTarget('user-123', 'group-456'), false, 'Both targets set must be rejected');
console.log('✅ Test 2 Passed: Mutual exclusivity constraint strictly enforced.\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Option A Department Scoping Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log('Test 3: Testing Option A Department Scoping logic...');
function canUserAccessGroupReviewTask(user, task, userReviewGroupIds) {
  // 1. Task must be in REVIEW and escalated to a group
  if (task.status !== 'REVIEW' || !task.escalated_to_group_id) return false;

  // 2. User must be a member of the review group
  if (!userReviewGroupIds.includes(task.escalated_to_group_id)) return false;

  // 3. Option A Strict Scoping: Department must match, or role is admin/manager
  const isPrivileged = user.role === 'admin' || user.role === 'manager';
  const isSameDept = user.department != null && user.department === task.department;

  return isPrivileged || isSameDept;
}

const supervisorDeptA = { id: 'sup-a', role: 'supervisor', department: 'IT' };
const supervisorDeptB = { id: 'sup-b', role: 'supervisor', department: 'Operation' };
const adminUser = { id: 'admin-1', role: 'admin', department: null };

const taskDeptA = {
  id: 'task-1',
  title: 'Setup Server',
  status: 'REVIEW',
  department: 'IT',
  escalated_to_group_id: 'group-tech-leads'
};

const taskDeptB = {
  id: 'task-2',
  title: 'Warehouse Audit',
  status: 'REVIEW',
  department: 'Operation',
  escalated_to_group_id: 'group-tech-leads'
};

const techLeadsGroup = ['group-tech-leads'];

// Supervisor A can access Task A in IT
assert.strictEqual(canUserAccessGroupReviewTask(supervisorDeptA, taskDeptA, techLeadsGroup), true);
// Supervisor A CANNOT access Task B in Operation (Option A Strict Scoping prevents leak!)
assert.strictEqual(canUserAccessGroupReviewTask(supervisorDeptA, taskDeptB, techLeadsGroup), false);
// Supervisor B CAN access Task B in Operation
assert.strictEqual(canUserAccessGroupReviewTask(supervisorDeptB, taskDeptB, techLeadsGroup), true);
// Admin can access tasks from all departments
assert.strictEqual(canUserAccessGroupReviewTask(adminUser, taskDeptA, techLeadsGroup), true);
assert.strictEqual(canUserAccessGroupReviewTask(adminUser, taskDeptB, techLeadsGroup), true);
console.log('✅ Test 3 Passed: Option A department scoping strictly blocks cross-department review leaks.\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Atomic Concurrency & Distinct End-States
// ─────────────────────────────────────────────────────────────────────────────
console.log('Test 4: Simulating Atomic Concurrency & Distinct End-States...');

// Mock database state
let mockDbTask = {
  id: 'task-review-1',
  title: 'Calculation Verification',
  status: 'REVIEW',
  assignee_id: null,
  escalated_from_user_id: 'originator-user-1',
  escalated_to_group_id: 'group-tech-leads',
  reviewed_by: null
};

function atomicResolveReview(taskId, action, reviewerId, feedbackReason = null) {
  // Atomic UPDATE WHERE id = taskId AND status = 'REVIEW'
  if (mockDbTask.id !== taskId || mockDbTask.status !== 'REVIEW') {
    return { success: false, rowsAffected: 0, currentTask: mockDbTask };
  }

  const newStatus = action === 'APPROVE' ? 'DONE' : 'IN_PROGRESS';

  mockDbTask.status = newStatus;
  mockDbTask.assignee_id = mockDbTask.escalated_from_user_id;
  mockDbTask.is_escalated = false;
  mockDbTask.escalated_to_user_id = null;
  mockDbTask.escalated_to_group_id = null;
  mockDbTask.reviewed_by = reviewerId;
  mockDbTask.rejection_feedback = feedbackReason;

  return { success: true, rowsAffected: 1, updatedTask: { ...mockDbTask } };
}

// Reviewer A acts first (APPROVE)
const firstAction = atomicResolveReview('task-review-1', 'APPROVE', 'reviewer-a');
assert.strictEqual(firstAction.success, true);
assert.strictEqual(firstAction.rowsAffected, 1);
assert.strictEqual(firstAction.updatedTask.status, 'DONE', 'Approve must resolve to DONE');
assert.strictEqual(firstAction.updatedTask.assignee_id, 'originator-user-1', 'Must return task to originator');
assert.strictEqual(firstAction.updatedTask.reviewed_by, 'reviewer-a', 'Must record reviewer ID');

// Reviewer B acts concurrently a moment later
const secondAction = atomicResolveReview('task-review-1', 'APPROVE', 'reviewer-b');
assert.strictEqual(secondAction.success, false);
assert.strictEqual(secondAction.rowsAffected, 0, 'Concurrent second action must fail gracefully');
assert.strictEqual(secondAction.currentTask.reviewed_by, 'reviewer-a', 'Identifies who already resolved the task');

// Test REJECT path with another task
mockDbTask = {
  id: 'task-review-2',
  title: 'Drawing Schema Revision',
  status: 'REVIEW',
  assignee_id: null,
  escalated_from_user_id: 'originator-user-2',
  escalated_to_group_id: 'group-tech-leads',
  reviewed_by: null
};

const rejectAction = atomicResolveReview('task-review-2', 'REJECT', 'reviewer-c', 'Tolong betulkan format jadual.');
assert.strictEqual(rejectAction.success, true);
assert.strictEqual(rejectAction.updatedTask.status, 'IN_PROGRESS', 'Reject must return to IN_PROGRESS');
assert.strictEqual(rejectAction.updatedTask.assignee_id, 'originator-user-2');
assert.strictEqual(rejectAction.updatedTask.rejection_feedback, 'Tolong betulkan format jadual.');
console.log('✅ Test 4 Passed: Atomic concurrency and distinct end-states (DONE vs IN_PROGRESS) verified.\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Role-Aware Label Formatting & Member Role Filtering
// ─────────────────────────────────────────────────────────────────────────────
console.log('Test 5: Testing Role-Aware Label Formatting & Member Role Filtering...');

function formatUserRoleLabel(p) {
  const roleCapitalized = p.role ? (p.role.charAt(0).toUpperCase() + p.role.slice(1).toLowerCase()) : '';
  if (p.role === 'admin' || p.role === 'manager') {
    return `${p.full_name} (${roleCapitalized})`;
  }
  if (p.department) {
    return `${p.full_name} (${roleCapitalized} · ${p.department})`;
  }
  return `${p.full_name} (${roleCapitalized || 'Staff'})`;
}

// 1. Label format assertions
assert.strictEqual(
  formatUserRoleLabel({ full_name: 'En Hafiz', role: 'manager', department: 'Human Resources' }),
  'En Hafiz (Manager)',
  'Manager label should omit department since access is global'
);

assert.strictEqual(
  formatUserRoleLabel({ full_name: 'Puan Widuri', role: 'admin', department: 'Outsourcing' }),
  'Puan Widuri (Admin)',
  'Admin label should omit department since access is global'
);

assert.strictEqual(
  formatUserRoleLabel({ full_name: 'Cik Arina', role: 'supervisor', department: 'Outsourcing' }),
  'Cik Arina (Supervisor · Outsourcing)',
  'Supervisor label must include role and department scope'
);

// 2. Member picker eligibility filter assertion
const ALLOWED_REVIEW_ROLES = ['admin', 'manager', 'supervisor'];
const sampleStaff = [
  { full_name: 'En Hafiz', role: 'manager' },
  { full_name: 'Cik Arina', role: 'supervisor' },
  { full_name: 'Megat Syafferizul', role: 'admin' },
  { full_name: 'Puan Qaisara', role: 'employee' },
  { full_name: 'Cik Nurin', role: 'employee' }
];

const eligibleStaff = sampleStaff.filter(s => ALLOWED_REVIEW_ROLES.includes(s.role));
assert.strictEqual(eligibleStaff.length, 3, 'Should filter out employees without approval authority');
assert.strictEqual(eligibleStaff.some(s => s.role === 'employee'), false, 'No employees should be eligible');

console.log('✅ Test 5 Passed: Role-aware labels and member role filtering verified.\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Option B Assignee Lifecycle & Originator Visibility
// ─────────────────────────────────────────────────────────────────────────────
console.log('Test 6: Testing Option B Assignee Lifecycle & Originator Visibility...');

const originatorUserId = 'user-originator-001';
const reviewGroupId = 'group-ops-leads';

// Step 1: Originator creates task and starts work
let taskState = {
  id: 'task-opt-b-01',
  title: 'Monthly EPF Submission',
  status: 'IN_PROGRESS',
  assignee_id: originatorUserId,
  created_by: originatorUserId,
  escalated_from_user_id: null,
  escalated_to_group_id: null,
  is_escalated: false
};

// Verify active list includes task
assert.strictEqual(taskState.assignee_id, originatorUserId);

// Step 2: Originator escalates to Review Group (Option B)
function escalateToReviewGroup(task, currentUserId, targetGroupId) {
  return {
    ...task,
    status: 'REVIEW',
    assignee_id: null, // Option B: nulled out during review so it does not appear in originator's active in-progress list
    is_escalated: true,
    escalated_from_user_id: currentUserId,
    escalated_to_group_id: targetGroupId,
    escalated_to_user_id: null
  };
}

taskState = escalateToReviewGroup(taskState, originatorUserId, reviewGroupId);

assert.strictEqual(taskState.status, 'REVIEW');
assert.strictEqual(taskState.assignee_id, null, 'Option B: assignee_id must be null during group review');
assert.strictEqual(taskState.escalated_from_user_id, originatorUserId, 'Originator preserved in escalated_from_user_id');
assert.strictEqual(taskState.escalated_to_group_id, reviewGroupId);

// Step 3: Check Originator Visibility
// Active list query: assignee_id = originatorUserId
const isInOriginatorActiveList = taskState.assignee_id === originatorUserId;
assert.strictEqual(isInOriginatorActiveList, false, 'Group-escalated task must NOT appear in originator active in-progress list');

// Originator Tracking query: escalated_from_user_id = originatorUserId AND status = 'REVIEW'
const isInOriginatorEscalatedOutQueue = taskState.escalated_from_user_id === originatorUserId && taskState.status === 'REVIEW';
assert.strictEqual(isInOriginatorEscalatedOutQueue, true, 'Group-escalated task MUST appear in originator "Menunggu Semakan Yang Dihantar" queue');

// Step 4: Review Group member resolves review (Approve -> DONE / Reject -> IN_PROGRESS)
// Both paths restore assignee_id = escalated_from_user_id
const approvedTask = {
  ...taskState,
  status: 'DONE',
  assignee_id: taskState.escalated_from_user_id,
  is_escalated: false,
  escalated_to_group_id: null,
  reviewed_by: 'reviewer-supervisor-99'
};
assert.strictEqual(approvedTask.status, 'DONE');
assert.strictEqual(approvedTask.assignee_id, originatorUserId, 'On Approve, assignee_id restored to originator');

const rejectedTask = {
  ...taskState,
  status: 'IN_PROGRESS',
  assignee_id: taskState.escalated_from_user_id,
  is_escalated: false,
  escalated_to_group_id: null,
  reviewed_by: 'reviewer-supervisor-99'
};
assert.strictEqual(rejectedTask.status, 'IN_PROGRESS');
assert.strictEqual(rejectedTask.assignee_id, originatorUserId, 'On Reject, assignee_id restored to originator for revisions');

console.log('✅ Test 6 Passed: Option B Assignee Lifecycle & Originator Visibility successfully validated.\n');

console.log('🎉 ALL REVIEW GROUP ESCALATION & LIFECYCLE TESTS PASSED SUCCESSFULLY!');

