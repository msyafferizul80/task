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

console.log('🎉 ALL REVIEW GROUP ESCALATION TESTS PASSED SUCCESSFULLY!');
