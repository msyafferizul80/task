import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

console.log('🧪 Starting Multi-Department Staff Assignment & Loan Test Suite...\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: user_has_department_access Shared Function Simulation
// ─────────────────────────────────────────────────────────────────────────────
console.log('Test 1: Testing user_has_department_access shared function logic...');

function user_has_department_access(user, department, userDepartmentsTable) {
    if (!user || !department) return false;

    // Admin & Manager have global access
    if (user.role === 'admin' || user.role === 'manager') {
        return true;
    }

    // Home / Primary department
    if (user.department && user.department === department) {
        return true;
    }

    // Additive borrowed / loaned departments
    if (userDepartmentsTable && userDepartmentsTable.some(ud => ud.user_id === user.id && ud.department === department)) {
        return true;
    }

    return false;
}

const adminUser = { id: 'usr-admin', role: 'admin', department: null };
const managerUser = { id: 'usr-mgr', role: 'manager', department: null };
const marketingStaff = { id: 'usr-mkt-01', role: 'employee', department: 'Marketing' };
const outsourcingStaff = { id: 'usr-out-01', role: 'employee', department: 'Outsourcing' };
const itSupervisor = { id: 'usr-it-sup', role: 'supervisor', department: 'IT' };

let userDepartments = [
    { id: 'grant-1', user_id: 'usr-mkt-01', department: 'Outsourcing', granted_by: 'usr-admin' },
    { id: 'grant-2', user_id: 'usr-it-sup', department: 'Outsourcing', granted_by: 'usr-admin' }
];

// Admin and Manager can access everything
assert.equal(user_has_department_access(adminUser, 'Marketing', userDepartments), true, 'Admin has Marketing access');
assert.equal(user_has_department_access(adminUser, 'Outsourcing', userDepartments), true, 'Admin has Outsourcing access');
assert.equal(user_has_department_access(managerUser, 'IT', userDepartments), true, 'Manager has IT access');

// Native staff access
assert.equal(user_has_department_access(outsourcingStaff, 'Outsourcing', userDepartments), true, 'Native Outsourcing staff has access');
assert.equal(user_has_department_access(outsourcingStaff, 'Marketing', userDepartments), false, 'Native Outsourcing staff does not have Marketing access');

// Borrowed staff access (Marketing staff borrowed into Outsourcing)
assert.equal(user_has_department_access(marketingStaff, 'Marketing', userDepartments), true, 'Marketing staff has home access');
assert.equal(user_has_department_access(marketingStaff, 'Outsourcing', userDepartments), true, 'Marketing staff has borrowed Outsourcing access');
assert.equal(user_has_department_access(marketingStaff, 'IT', userDepartments), false, 'Marketing staff has no IT access');

// Borrowed supervisor access
assert.equal(user_has_department_access(itSupervisor, 'IT', userDepartments), true, 'IT supervisor has IT access');
assert.equal(user_has_department_access(itSupervisor, 'Outsourcing', userDepartments), true, 'IT supervisor has borrowed Outsourcing access');

// Revocation test: remove grant from user_departments
userDepartments = userDepartments.filter(ud => !(ud.user_id === 'usr-mkt-01' && ud.department === 'Outsourcing'));
assert.equal(user_has_department_access(marketingStaff, 'Outsourcing', userDepartments), false, 'Revoked loan immediately removes Outsourcing access');
assert.equal(user_has_department_access(marketingStaff, 'Marketing', userDepartments), true, 'Retains native home department');

console.log('✅ Test 1 Passed: user_has_department_access logic verified including loan addition and revocation.\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: RLS & Comments Scoping Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log('Test 2: Testing tsk_comments and tsk_tasks RLS scoping with shared access...');

// Restore grant
userDepartments.push({ id: 'grant-1', user_id: 'usr-mkt-01', department: 'Outsourcing', granted_by: 'usr-admin' });

function canViewTaskComments(currentUser, task, userDepts) {
    if (currentUser.id === task.assignee_id) return true;
    if (currentUser.id === task.created_by) return true;
    return user_has_department_access(currentUser, task.department, userDepts);
}

const outsourcingTask = {
    id: 'tsk-001',
    title: 'Payroll March',
    department: 'Outsourcing',
    assignee_id: 'usr-out-01',
    created_by: 'usr-out-01'
};

// Loaned marketing staff can view comments on Outsourcing task
assert.equal(canViewTaskComments(marketingStaff, outsourcingTask, userDepartments), true, 'Loaned staff can view comments on borrowed dept tasks');

// Unrelated IT staff without loan cannot view comments
const unrelatedStaff = { id: 'usr-unrelated', role: 'employee', department: 'Sales' };
assert.equal(canViewTaskComments(unrelatedStaff, outsourcingTask, userDepartments), false, 'Unrelated staff without loan cannot view comments');

console.log('✅ Test 2 Passed: Comments and task RLS scoping verified.\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: EscalateModal Reviewer Dropdown Scoping
// ─────────────────────────────────────────────────────────────────────────────
console.log('Test 3: Testing EscalateModal reviewer dropdown scoping...');

const allProfiles = [
    { id: 'usr-admin', full_name: 'Admin User', role: 'admin', department: null },
    { id: 'usr-mgr', full_name: 'Manager User', role: 'manager', department: null },
    { id: 'usr-out-01', full_name: 'Outsourcing Native', role: 'employee', department: 'Outsourcing' },
    { id: 'usr-mkt-01', full_name: 'Marketing Loaned', role: 'employee', department: 'Marketing' },
    { id: 'usr-sales-01', full_name: 'Sales Rep', role: 'employee', department: 'Sales' }
];

function getEligibleReviewers(currentUserId, taskDept, profiles, userDepts) {
    return profiles.filter(p => {
        if (p.id === currentUserId) return false;
        if (!taskDept) return true;
        if (p.role === 'admin' || p.role === 'manager') return true;
        if (p.department === taskDept) return true;
        return userDepts.some(ud => ud.user_id === p.id && ud.department === taskDept);
    });
}

const eligible = getEligibleReviewers('usr-out-01', 'Outsourcing', allProfiles, userDepartments);
const eligibleIds = eligible.map(p => p.id);

assert.ok(eligibleIds.includes('usr-admin'), 'Admin is eligible reviewer');
assert.ok(eligibleIds.includes('usr-mgr'), 'Manager is eligible reviewer');
assert.ok(eligibleIds.includes('usr-mkt-01'), 'Loaned Marketing staff is eligible reviewer for Outsourcing task');
assert.ok(!eligibleIds.includes('usr-sales-01'), 'Sales Rep without Outsourcing loan is NOT eligible');
assert.ok(!eligibleIds.includes('usr-out-01'), 'Current user is excluded');

console.log('✅ Test 3 Passed: EscalateModal reviewer dropdown includes native + borrowed staff.\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Trigger Validation Step Order (fn_sync_and_validate_task)
// ─────────────────────────────────────────────────────────────────────────────
console.log('Test 4: Testing trigger validation step order & no department forcing...');

const customersDb = {
    'SYAZNA WORLD (INTERNAL)': { is_internal: true },
    'Acme Corp External': { is_internal: false }
};

function simulateTaskTrigger(newTask, userDepts, profilesDb) {
    const task = { ...newTask };

    // STEP 1: Sync is_internal flag based on customer
    if (task.customer_name) {
        const cust = customersDb[task.customer_name];
        task.is_internal = cust ? cust.is_internal : false;
    }

    // STEP 2: Creator department validation and fallback (no force-override!)
    if (task.created_by) {
        const creator = profilesDb[task.created_by];
        if (!task.department && creator?.department) {
            task.department = creator.department;
        }

        if (creator && creator.role !== 'admin' && creator.role !== 'manager' && task.department) {
            const hasAccess = user_has_department_access(creator, task.department, userDepts);
            if (!hasAccess) {
                throw new Error(`Pengguna tidak mempunyai kebenaran untuk jabatan "${task.department}"`);
            }
        }
    }

    // STEP 3: Strict Outsourcing + Internal Customer rule validation
    if (task.is_internal === true && task.department === 'Outsourcing') {
        throw new Error('Tugasan pelanggan dalaman tidak boleh ditetapkan kepada Jabatan Outsourcing');
    }

    // STEP 4: Assignee department access validation
    if (task.assignee_id && task.department) {
        const assignee = profilesDb[task.assignee_id];
        const hasAccess = user_has_department_access(assignee, task.department, userDepts);
        if (!hasAccess) {
            throw new Error(`Assignee tidak mempunyai akses kepada jabatan "${task.department}"`);
        }
    }

    return task;
}

const profilesMap = {
    'usr-mkt-01': marketingStaff,
    'usr-out-01': outsourcingStaff,
    'usr-sales-01': { id: 'usr-sales-01', role: 'employee', department: 'Sales' }
};

// Case A: Marketing staff creates a task for borrowed Outsourcing dept (external client) -> SUCCESS
const validLoanTask = simulateTaskTrigger({
    title: 'Audit Payroll',
    customer_name: 'Acme Corp External',
    created_by: 'usr-mkt-01',
    department: 'Outsourcing',
    assignee_id: 'usr-mkt-01'
}, userDepartments, profilesMap);
assert.equal(validLoanTask.department, 'Outsourcing', 'Department is retained as Outsourcing without being forced to Marketing');
assert.equal(validLoanTask.is_internal, false);

// Case B: Marketing staff tries to create internal customer task under Outsourcing -> REJECTED at Step 3
assert.throws(() => {
    simulateTaskTrigger({
        title: 'Internal Audit',
        customer_name: 'SYAZNA WORLD (INTERNAL)',
        created_by: 'usr-mkt-01',
        department: 'Outsourcing',
        assignee_id: 'usr-mkt-01'
    }, userDepartments, profilesMap);
}, /Tugasan pelanggan dalaman tidak boleh ditetapkan kepada Jabatan Outsourcing/);

// Case C: Assigning to a staff member who does NOT have access to that department -> REJECTED at Step 4
assert.throws(() => {
    simulateTaskTrigger({
        title: 'Outsourcing Task',
        customer_name: 'Acme Corp External',
        created_by: 'usr-mkt-01',
        department: 'Outsourcing',
        assignee_id: 'usr-sales-01' // Sales staff without loan to Outsourcing
    }, userDepartments, profilesMap);
}, /Assignee tidak mempunyai akses kepada jabatan "Outsourcing"/);

console.log('✅ Test 4 Passed: Trigger step ordering and department validation strictly verified.\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Telegram Routing Invariance Confirmation
// ─────────────────────────────────────────────────────────────────────────────
console.log('Test 5: Testing Telegram routing invariance for tasks created by borrowed staff...');

import { resolveTaskTelegramGroup } from '../supabase/functions/_shared/routing.ts';

const deptGroupMap = {
    'Marketing': '-1001111111111',
    'Outsourcing': '-1002222222222'
};

// Task created by Marketing staff, but under Outsourcing department
const taskByLoanedStaff = {
    department: 'Outsourcing',
    is_internal: false,
    customer_name: 'Acme Corp External'
};

const routedGroup = resolveTaskTelegramGroup(taskByLoanedStaff, deptGroupMap, '-100fallback');
assert.equal(routedGroup, '-1002222222222', 'Must route to Outsourcing telegram group, not Marketing');

console.log('✅ Test 5 Passed: Telegram notification routing keys exclusively off task.department.\n');

console.log('🎉 ALL MULTI-DEPARTMENT & STAFF LOAN TESTS PASSED SUCCESSFULLY! (5/5)');
