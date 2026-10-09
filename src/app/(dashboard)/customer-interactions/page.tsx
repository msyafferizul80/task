'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Button,
    Form,
    Input,
    message,
    Modal,
    Select,
    Space,
    Table,
    Tag
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
    DeleteOutlined,
    EditOutlined,
    HistoryOutlined,
    MessageOutlined,
    PlusOutlined,
    SearchOutlined,
    StopOutlined,
    UndoOutlined,
    CheckCircleOutlined,
    ReloadOutlined
} from '@ant-design/icons';
import { createClient } from '@/utils/supabase/client';
import { useRole } from '@/components/layout/RoleProvider';

const { TextArea } = Input;

type InteractionLog = {
    id: string;
    customer_id: string | null;
    customer_name: string;
    employee_name: string;
    interaction_at: string;
    interaction_type: string;
    subject: string;
    notes: string | null;
    logged_by: string | null;
    logged_by_name: string;
    is_resolved: boolean;
    resolved_at: string | null;
    resolved_by: string | null;
    resolved_by_name: string | null;
    is_crossed_out: boolean;
    crossed_out_at: string | null;
    crossed_out_by: string | null;
    crossed_out_by_name: string | null;
    created_at: string;
    updated_at: string;
};

type Customer = {
    id: string;
    name: string;
    status: string;
};

type InteractionUpdate = {
    id: string;
    interaction_id: string;
    interaction_at: string;
    interaction_type: string;
    subject: string;
    notes: string | null;
    logged_by: string | null;
    logged_by_name: string;
    is_crossed_out: boolean;
    crossed_out_at: string | null;
    crossed_out_by: string | null;
    crossed_out_by_name: string | null;
    created_at: string;
};

type InteractionEntryAction = {
    id: string;
    interaction_id: string;
    entry_type: 'interaction' | 'update';
    entry_id: string;
    action: 'cross_out' | 'restore';
    acted_by_name: string;
    created_at: string;
};

type ProfileOption = {
    id: string;
    full_name: string;
};

type InteractionFormValues = {
    customer_id: string;
    employee_name: string;
    interaction_at: string;
    interaction_type: string;
    subject: string;
    notes?: string;
};

type FollowUpFormValues = {
    interaction_at: string;
    interaction_type: string;
    subject: string;
    notes?: string;
};

const interactionTypes = [
    'Phone call',
    'Email',
    'WhatsApp',
    'Telegram',
    'Meeting',
    'Site visit',
    'Other'
];

function toLocalDateTimeInput(date: Date) {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 16);
}

function formatInteractionDateTime(value: string) {
    const date = new Date(value);
    const formattedDate = new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(date);
    const formattedTime = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    }).format(date).toLowerCase();

    return { formattedDate, formattedTime };
}

export default function CustomerInteractionsPage() {
    const supabase = createClient();
    const { role } = useRole();
    const [logs, setLogs] = useState<InteractionLog[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [profiles, setProfiles] = useState<ProfileOption[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingLog, setEditingLog] = useState<InteractionLog | null>(null);
    const [timelineLog, setTimelineLog] = useState<InteractionLog | null>(null);
    const [timelineUpdates, setTimelineUpdates] = useState<InteractionUpdate[]>([]);
    const [timelineActions, setTimelineActions] = useState<InteractionEntryAction[]>([]);
    const [timelineLoading, setTimelineLoading] = useState(false);
    const [isFollowUpSubmitting, setIsFollowUpSubmitting] = useState(false);
    const [updatingEntryId, setUpdatingEntryId] = useState<string | null>(null);
    const [searchText, setSearchText] = useState('');
    const [filterCustomer, setFilterCustomer] = useState<string>();
    const [filterLoggedBy, setFilterLoggedBy] = useState<string>();
    const [filterResolution, setFilterResolution] = useState<'ongoing' | 'complete'>('ongoing');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalLogs, setTotalLogs] = useState(0);
    const [form] = Form.useForm<InteractionFormValues>();
    const [followUpForm] = Form.useForm<FollowUpFormValues>();
    const logFetchSequence = useRef(0);

    const fetchLogs = useCallback(async (page = currentPage) => {
        const requestSequence = ++logFetchSequence.current;
        setLoading(true);
        try {
            let query = supabase
                .from('tsk_customer_interaction_logs')
                .select('*', { count: 'exact' })
                .order('interaction_at', { ascending: false })
                .range((page - 1) * pageSize, page * pageSize - 1);
            const disjunctions: string[] = [];
            query = query.eq('is_resolved', filterResolution === 'complete');

            if (filterCustomer) {
                const customer = customers.find((item) => item.id === filterCustomer);
                if (customer) {
                    const escapedName = customer.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    disjunctions.push(`or(customer_id.eq.${customer.id},customer_name.eq."${escapedName}")`);
                } else {
                    query = query.eq('customer_name', filterCustomer);
                }
            }
            if (filterLoggedBy) query = query.eq('logged_by', filterLoggedBy);

            const search = searchText.trim().replace(/[\r\n]/g, ' ');
            if (search) {
                const escapedSearch = search.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                const pattern = `"%${escapedSearch}%"`;
                disjunctions.push(`or(${[
                    `customer_name.ilike.${pattern}`,
                    `employee_name.ilike.${pattern}`,
                    `interaction_type.ilike.${pattern}`,
                    `subject.ilike.${pattern}`,
                    `notes.ilike.${pattern}`,
                    `logged_by_name.ilike.${pattern}`
                ].join(',')})`);
            }
            if (disjunctions.length) query = query.or(`and(${disjunctions.join(',')})`);

            const { data, count, error } = await query;
            if (error) throw error;
            if (requestSequence !== logFetchSequence.current) return;
            setLogs(data || []);
            setTotalLogs(count || 0);
        } catch (error) {
            if (requestSequence !== logFetchSequence.current) return;
            console.error('Error fetching customer interactions:', error);
            message.error(error instanceof Error ? error.message : 'Failed to load interaction logs');
        } finally {
            if (requestSequence === logFetchSequence.current) setLoading(false);
        }
    }, [supabase, currentPage, pageSize, filterCustomer, filterLoggedBy, filterResolution, searchText, customers]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    useEffect(() => {
        let cancelled = false;
        const fetchLookups = async () => {
            try {
                const [
                    { data: { user }, error: userError },
                    customersResult,
                    profilesResult
                ] = await Promise.all([
                    supabase.auth.getUser(),
                    supabase.from('tsk_customers').select('id, name, status').order('name'),
                    supabase.from('lv_profiles').select('id, full_name').order('full_name')
                ]);
                if (userError) throw userError;
                if (!user) throw new Error('You must be signed in to view interaction logs.');
                if (customersResult.error) throw customersResult.error;
                if (profilesResult.error) throw profilesResult.error;
                if (cancelled) return;
                setCurrentUserId(user.id);
                setCustomers(customersResult.data || []);
                setProfiles(profilesResult.data || []);
            } catch (error) {
                if (cancelled) return;
                console.error('Error fetching customer interaction options:', error);
                message.error(error instanceof Error ? error.message : 'Failed to load interaction options');
            }
        };
        fetchLookups();
        return () => {
            cancelled = true;
        };
    }, [supabase]);

    const openCreateModal = () => {
        setEditingLog(null);
        form.resetFields();
        form.setFieldsValue({
            interaction_at: toLocalDateTimeInput(new Date()),
            interaction_type: 'Other'
        });
        setIsModalOpen(true);
    };

    const openEditModal = (log: InteractionLog) => {
        const matchingCustomers = customers.filter((customer) => customer.name === log.customer_name);
        setEditingLog(log);
        form.setFieldsValue({
            customer_id: log.customer_id || (matchingCustomers.length === 1 ? matchingCustomers[0].id : undefined),
            employee_name: log.employee_name,
            interaction_at: toLocalDateTimeInput(new Date(log.interaction_at)),
            interaction_type: log.interaction_type,
            subject: log.subject,
            notes: log.notes || ''
        });
        setIsModalOpen(true);
    };

    const openTimeline = async (log: InteractionLog) => {
        setTimelineLog(log);
        setTimelineUpdates([]);
        setTimelineActions([]);
        setTimelineLoading(true);
        followUpForm.resetFields();
        followUpForm.setFieldsValue({
            interaction_at: toLocalDateTimeInput(new Date()),
            interaction_type: log.interaction_type
        });

        try {
            const [logResult, updatesResult, actionsResult] = await Promise.all([
                supabase
                    .from('tsk_customer_interaction_logs')
                    .select('*')
                    .eq('id', log.id)
                    .single(),
                supabase
                    .from('tsk_customer_interaction_updates')
                    .select('*')
                    .eq('interaction_id', log.id)
                    .order('interaction_at', { ascending: true }),
                supabase
                    .from('tsk_customer_interaction_entry_actions')
                    .select('*')
                    .eq('interaction_id', log.id)
                    .order('created_at', { ascending: true })
            ]);
            if (logResult.error) throw logResult.error;
            if (updatesResult.error) throw updatesResult.error;
            if (actionsResult.error) throw actionsResult.error;
            setTimelineLog(logResult.data);
            setTimelineUpdates(updatesResult.data || []);
            setTimelineActions(actionsResult.data || []);
        } catch (error) {
            console.error('Error fetching interaction timeline:', error);
            message.error(error instanceof Error ? error.message : 'Failed to load interaction timeline');
        } finally {
            setTimelineLoading(false);
        }
    };

    const handleToggleResolution = async (log: InteractionLog) => {
        if (updatingEntryId) return;
        setUpdatingEntryId(`resolution:${log.id}`);
        try {
            const { data, error } = await supabase.rpc('toggle_customer_interaction_resolution', {
                p_interaction_id: log.id
            });
            if (error) throw error;
            if (typeof data !== 'boolean') throw new Error('The server returned an invalid interaction status.');

            message.success(data ? 'Interaction marked as complete.' : 'Interaction reopened.');
            setCurrentPage(1);
            await fetchLogs(1);
        } catch (error) {
            console.error('Error updating customer interaction status:', error);
            message.error(error instanceof Error ? error.message : 'Failed to update interaction status');
        } finally {
            setUpdatingEntryId(null);
        }
    };

    const handleToggleCrossout = async (
        entryType: InteractionEntryAction['entry_type'],
        entryId: string
    ) => {
        if (!timelineLog || updatingEntryId) return;

        const entryKey = `${entryType}:${entryId}`;
        setUpdatingEntryId(entryKey);
        try {
            const { data, error } = await supabase.rpc('toggle_customer_interaction_entry_crossout', {
                p_entry_type: entryType,
                p_entry_id: entryId
            });
            if (error) throw error;
            if (typeof data !== 'boolean') throw new Error('The server returned an invalid timeline entry status.');

            message.success(data ? 'Timeline entry crossed out.' : 'Timeline entry restored.');
            await openTimeline(timelineLog);
        } catch (error) {
            console.error('Error updating interaction timeline entry:', error);
            message.error(error instanceof Error ? error.message : 'Failed to update timeline entry');
        } finally {
            setUpdatingEntryId(null);
        }
    };

    const handleAddFollowUp = async (values: FollowUpFormValues) => {
        if (!timelineLog) return;

        const interactionAt = new Date(values.interaction_at);
        if (Number.isNaN(interactionAt.getTime())) {
            message.error('Enter a valid date and time for the follow-up.');
            return;
        }

        setIsFollowUpSubmitting(true);
        try {
            const { error } = await supabase
                .from('tsk_customer_interaction_updates')
                .insert({
                    interaction_id: timelineLog.id,
                    interaction_at: interactionAt.toISOString(),
                    interaction_type: values.interaction_type,
                    subject: values.subject.trim(),
                    notes: values.notes?.trim() || null
                });
            if (error) throw error;

            message.success('Follow-up added to the interaction timeline.');
            const updatedTimelineLog = timelineLog;
            followUpForm.resetFields();
            followUpForm.setFieldsValue({
                interaction_at: toLocalDateTimeInput(new Date()),
                interaction_type: updatedTimelineLog.interaction_type
            });
            await openTimeline(updatedTimelineLog);
        } catch (error) {
            console.error('Error adding interaction follow-up:', error);
            message.error(error instanceof Error ? error.message : 'Failed to add follow-up');
        } finally {
            setIsFollowUpSubmitting(false);
        }
    };

    const handleSave = async (values: InteractionFormValues) => {
        const interactionAt = new Date(values.interaction_at);
        if (Number.isNaN(interactionAt.getTime())) {
            message.error('Enter a valid interaction date and time.');
            return;
        }

        const customer = customers.find((item) => item.id === values.customer_id);
        if (!customer) {
            message.error('Select a valid customer.');
            return;
        }

        const record = {
            customer_id: customer.id,
            customer_name: customer.name,
            employee_name: values.employee_name.trim(),
            interaction_at: interactionAt.toISOString(),
            interaction_type: values.interaction_type,
            subject: values.subject.trim(),
            notes: values.notes?.trim() || null
        };

        setIsSubmitting(true);
        try {
            if (editingLog) {
                const { error } = await supabase
                    .from('tsk_customer_interaction_logs')
                    .update(record)
                    .eq('id', editingLog.id)
                    .eq('logged_by', currentUserId);
                if (error) throw error;
                message.success('Interaction log updated.');
            } else {
                const { error } = await supabase
                    .from('tsk_customer_interaction_logs')
                    .insert(record);
                if (error) throw error;
                message.success('Interaction logged.');
            }

            setIsModalOpen(false);
            form.resetFields();
            setCurrentPage(1);
            await fetchLogs(1);
        } catch (error) {
            console.error('Error saving customer interaction:', error);
            message.error(error instanceof Error ? error.message : 'Failed to save interaction log');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = (log: InteractionLog) => {
        Modal.confirm({
            title: 'Delete interaction log?',
            content: 'This will permanently remove this interaction from the shared log.',
            okText: 'Delete',
            okType: 'danger',
            cancelText: 'Cancel',
            onOk: async () => {
                try {
                    const { error } = await supabase
                        .from('tsk_customer_interaction_logs')
                        .delete()
                        .eq('id', log.id)
                        .eq('logged_by', currentUserId);
                    if (error) throw error;
                    message.success('Interaction log deleted.');
                    const targetPage = logs.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage;
                    setCurrentPage(targetPage);
                    await fetchLogs(targetPage);
                } catch (error) {
                    console.error('Error deleting customer interaction:', error);
                    message.error(error instanceof Error ? error.message : 'Failed to delete interaction log');
                }
            }
        });
    };

    const activeCustomers = useMemo(
        () => customers.filter((customer) => customer.status === 'active'),
        [customers]
    );

    const loggedByOptions = useMemo(() => {
        return profiles
            .map((profile) => ({ value: profile.id, label: profile.full_name }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [profiles]);

    const columns: TableColumnsType<InteractionLog> = [
        {
            title: 'Customer',
            dataIndex: 'customer_name',
            key: 'customer_name',
            width: 200
        },
        {
            title: 'Customer employee',
            dataIndex: 'employee_name',
            key: 'employee_name',
            width: 170
        },
        {
            title: 'Interaction',
            key: 'interaction',
            render: (_value, log) => (
                <div className="min-w-48">
                    <Tag color="blue">
                        {log.interaction_type}
                    </Tag>
                    <div className="font-medium text-slate-800">{log.subject}</div>
                    {log.notes && <div className="mt-1 line-clamp-2 text-xs text-slate-500">{log.notes}</div>}
                </div>
            )
        },
        {
            title: 'Date & time',
            dataIndex: 'interaction_at',
            key: 'interaction_at',
            width: 130,
            render: (value: string) => {
                const { formattedDate, formattedTime } = formatInteractionDateTime(value);
                return (
                    <div className="whitespace-nowrap text-center text-sm leading-tight">
                        <div>{formattedDate}</div>
                        <div>{formattedTime}</div>
                    </div>
                );
            }
        },
        {
            title: 'Owner / logged by',
            dataIndex: 'logged_by_name',
            key: 'logged_by_name',
            width: 160
        },
        {
            title: 'Status',
            dataIndex: 'is_resolved',
            key: 'is_resolved',
            width: 120,
            render: (isResolved: boolean, log) => (
                <Space direction="vertical" size={2}>
                    <Tag color={isResolved ? 'green' : 'gold'}>
                        {isResolved ? 'Complete' : 'Ongoing'}
                    </Tag>
                    {isResolved && log.resolved_by_name && (
                        <span className="text-xs text-slate-500">Resolved by {log.resolved_by_name}</span>
                    )}
                </Space>
            )
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 280,
            render: (_value, log) => (
                <Space size="small">
                    <Button
                        type="text"
                        aria-label="View interaction timeline"
                        icon={<HistoryOutlined />}
                        onClick={() => openTimeline(log)}
                    >
                        Timeline
                    </Button>
                    {(log.logged_by === currentUserId || role === 'admin') && (
                        <Button
                            type="text"
                            aria-label={log.is_resolved ? 'Reopen interaction' : 'Mark interaction complete'}
                            icon={log.is_resolved ? <ReloadOutlined /> : <CheckCircleOutlined />}
                            loading={updatingEntryId === `resolution:${log.id}`}
                            onClick={() => handleToggleResolution(log)}
                        >
                            {log.is_resolved ? 'Reopen' : 'Complete'}
                        </Button>
                    )}
                    {log.logged_by === currentUserId && (
                        <>
                    <Button
                        type="text"
                        aria-label="Edit interaction"
                        icon={<EditOutlined />}
                        onClick={() => openEditModal(log)}
                    />
                    <Button
                        type="text"
                        danger
                        aria-label="Delete interaction"
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(log)}
                    />
                        </>
                    )}
                </Space>
            )
        }
    ];

    return (
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm md:p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-slate-800">
                        <MessageOutlined className="text-cyan-600" />
                        Customer Interactions
                    </h1>
                    <p className="text-sm text-slate-500">
                        Shared record of conversations and actions involving customer employees.
                    </p>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                    Log interaction
                </Button>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Input
                    allowClear
                    prefix={<SearchOutlined className="text-slate-400" />}
                    placeholder="Search customer, employee, subject..."
                    value={searchText}
                    onChange={(event) => {
                        setSearchText(event.target.value);
                        setCurrentPage(1);
                    }}
                />
                <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="Filter by customer"
                    value={filterCustomer}
                    onChange={(value) => {
                        setFilterCustomer(value);
                        setCurrentPage(1);
                    }}
                    options={customers.map((customer) => ({ value: customer.id, label: customer.name }))}
                />
                <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="Filter by logged by"
                    value={filterLoggedBy}
                    onChange={(value) => {
                        setFilterLoggedBy(value);
                        setCurrentPage(1);
                    }}
                    options={loggedByOptions}
                />
                <Select
                    aria-label="Filter by interaction status"
                    value={filterResolution}
                    onChange={(value: 'ongoing' | 'complete') => {
                        setFilterResolution(value);
                        setCurrentPage(1);
                    }}
                    options={[
                        { value: 'ongoing', label: 'Ongoing interactions' },
                        { value: 'complete', label: 'Complete interactions' }
                    ]}
                />
            </div>

            <Table
                columns={columns}
                dataSource={logs}
                rowKey="id"
                loading={loading}
                pagination={{
                    current: currentPage,
                    pageSize,
                    total: totalLogs,
                    showSizeChanger: true,
                    showTotal: (total) => `${total} interactions`
                }}
                onChange={(pagination) => {
                    if (pagination.pageSize && pagination.pageSize !== pageSize) {
                        setPageSize(pagination.pageSize);
                        setCurrentPage(1);
                    } else if (pagination.current) {
                        setCurrentPage(pagination.current);
                    }
                }}
                scroll={{ x: 1100 }}
                locale={{
                    emptyText: filterResolution === 'ongoing'
                        ? 'No ongoing customer interactions.'
                        : 'No complete customer interactions.'
                }}
            />

            <Modal
                title={editingLog ? 'Edit interaction log' : 'Log a customer interaction'}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                onOk={() => form.submit()}
                okText={editingLog ? 'Save changes' : 'Save interaction'}
                okButtonProps={{ loading: isSubmitting }}
                destroyOnHidden
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSave}
                    requiredMark="optional"
                    className="mt-5"
                >
                    <Form.Item
                        name="customer_id"
                        label="Customer / company"
                        rules={[{ required: true, whitespace: true, message: 'Enter the customer or company name.' }]}
                    >
                        <Select
                            showSearch
                            optionFilterProp="label"
                            placeholder="Select customer"
                            size="large"
                            notFoundContent="No active customers found"
                            options={(editingLog ? customers : activeCustomers).map((customer) => ({
                                value: customer.id,
                                label: customer.name
                            }))}
                        />
                    </Form.Item>
                    <Form.Item
                        name="employee_name"
                        label="Customer employee"
                        rules={[{ required: true, whitespace: true, message: 'Enter the employee name.' }]}
                    >
                        <Input maxLength={200} placeholder="Name of the person you interacted with" />
                    </Form.Item>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Form.Item
                            name="interaction_at"
                            label="Date and time"
                            rules={[{ required: true, message: 'Choose when the interaction took place.' }]}
                        >
                            <Input type="datetime-local" />
                        </Form.Item>
                        <Form.Item
                            name="interaction_type"
                            label="Interaction via"
                            rules={[{ required: true, message: 'Choose how the interaction took place.' }]}
                        >
                            <Select options={interactionTypes.map((type) => ({ value: type, label: type }))} />
                        </Form.Item>
                    </div>
                    <Form.Item
                        name="subject"
                        label="What was it about?"
                        rules={[{ required: true, whitespace: true, message: 'Enter the interaction subject.' }]}
                    >
                        <Input maxLength={250} placeholder="For example: Warning issued for late payment" />
                    </Form.Item>
                    <Form.Item name="notes" label="Notes">
                        <TextArea rows={4} maxLength={5000} showCount placeholder="Add details or outcome..." />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="Interaction timeline"
                open={Boolean(timelineLog)}
                onCancel={() => setTimelineLog(null)}
                footer={<Button onClick={() => setTimelineLog(null)}>Close</Button>}
                width={1000}
                style={{ maxWidth: 'calc(100vw - 32px)' }}
                destroyOnHidden
            >
                <div className="grid max-h-[min(70vh,680px)] min-h-0 grid-cols-1 items-start gap-5 overflow-y-auto overscroll-contain lg:grid-cols-2 lg:overflow-hidden">
                    <section className="min-h-0 overflow-y-auto overscroll-contain border-b border-slate-200 pb-4 pr-2 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">
                        {timelineLog && (
                            <>
                                <div className="mb-4">
                                    <div className="text-sm font-semibold text-slate-800">
                                        {timelineLog.customer_name} · {timelineLog.employee_name}
                                    </div>
                                    <p className="mb-0 text-xs text-slate-500">
                                        Add a dated entry to this interaction.
                                    </p>
                                </div>
                                <h3 className="mb-3 text-base font-semibold text-slate-800">Add follow-up entry</h3>
                                <Form
                                    form={followUpForm}
                                    layout="vertical"
                                    onFinish={handleAddFollowUp}
                                    requiredMark="optional"
                                >
                                    <Form.Item
                                        name="interaction_at"
                                        label="Date and time"
                                        rules={[{ required: true, message: 'Choose when the follow-up took place.' }]}
                                    >
                                        <Input type="datetime-local" />
                                    </Form.Item>
                                    <Form.Item
                                        name="interaction_type"
                                        label="Interaction via"
                                        rules={[{ required: true, message: 'Choose how the interaction took place.' }]}
                                    >
                                        <Select options={interactionTypes.map((type) => ({ value: type, label: type }))} />
                                    </Form.Item>
                                    <Form.Item
                                        name="subject"
                                        label="What was it about?"
                                        rules={[{ required: true, whitespace: true, message: 'Enter the follow-up subject.' }]}
                                    >
                                        <Input maxLength={250} placeholder="Summarize this follow-up" />
                                    </Form.Item>
                                    <Form.Item name="notes" label="Notes">
                                        <TextArea rows={4} maxLength={5000} showCount placeholder="Add details or outcome..." />
                                    </Form.Item>
                                    <Button type="primary" htmlType="submit" loading={isFollowUpSubmitting} icon={<PlusOutlined />}>
                                        Add to timeline
                                    </Button>
                                </Form>
                            </>
                        )}
                    </section>

                    <section className="flex max-h-[min(60vh,560px)] min-h-0 flex-col overflow-hidden">
                        <h3 className="mb-3 shrink-0 text-base font-semibold text-slate-800">Chronological timeline</h3>
                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 pl-2 pr-2">
                            {timelineLoading ? (
                                <div className="py-8 text-center text-slate-500">Loading timeline...</div>
                            ) : timelineLog ? (
                                <ol className="space-y-4 border-l-2 border-cyan-100 pl-5">
                                    {[{
                                        id: timelineLog.id,
                                        entry_type: 'interaction' as const,
                                        interaction_at: timelineLog.interaction_at,
                                        interaction_type: timelineLog.interaction_type,
                                        subject: timelineLog.subject,
                                        notes: timelineLog.notes,
                                        logged_by: timelineLog.logged_by,
                                        logged_by_name: timelineLog.logged_by_name,
                                        is_crossed_out: timelineLog.is_crossed_out
                                    }, ...timelineUpdates.map((entry) => ({
                                        ...entry,
                                        entry_type: 'update' as const
                                    }))]
                                        .sort((a, b) => new Date(a.interaction_at).getTime() - new Date(b.interaction_at).getTime())
                                        .map((entry) => (
                                            <li key={`${entry.entry_type}:${entry.id}`} className="relative">
                                                <span className="absolute -left-[26px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-cyan-500 shadow" />
                                                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                                                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                                                        <Space size={4}>
                                                            <Tag color={entry.is_crossed_out ? 'default' : 'blue'}>{entry.interaction_type}</Tag>
                                                            {entry.is_crossed_out && <Tag color="default">Crossed out</Tag>}
                                                        </Space>
                                                        <span className="text-xs text-slate-500">
                                                            {new Date(entry.interaction_at).toLocaleString()} · Logged by {entry.logged_by_name}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className={`font-medium ${entry.is_crossed_out ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                                                                {entry.subject}
                                                            </div>
                                                            {entry.notes && (
                                                                <p className={`mb-0 mt-1 whitespace-pre-wrap text-sm ${entry.is_crossed_out ? 'text-slate-400 line-through' : 'text-slate-600'}`}>
                                                                    {entry.notes}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            icon={entry.is_crossed_out ? <UndoOutlined /> : <StopOutlined />}
                                                            disabled={entry.logged_by !== currentUserId && role !== 'admin'}
                                                            loading={updatingEntryId === `${entry.entry_type}:${entry.id}`}
                                                            aria-label={entry.is_crossed_out ? 'Restore timeline entry' : 'Cross out timeline entry'}
                                                            title={entry.logged_by !== currentUserId && role !== 'admin'
                                                                ? 'Only the entry logger or an admin can change its status.'
                                                                : undefined}
                                                            onClick={() => handleToggleCrossout(entry.entry_type, entry.id)}
                                                        >
                                                            {entry.is_crossed_out ? 'Restore' : 'Cross out'}
                                                        </Button>
                                                    </div>
                                                    {timelineActions
                                                        .filter((action) => action.entry_type === entry.entry_type && action.entry_id === entry.id)
                                                        .map((action) => (
                                                            <div key={action.id} className="mt-2 text-xs text-slate-500">
                                                                {action.action === 'cross_out' ? 'Crossed out' : 'Restored'} by {action.acted_by_name} · {new Date(action.created_at).toLocaleString()}
                                                            </div>
                                                        ))}
                                                </div>
                                            </li>
                                        ))}
                                </ol>
                            ) : null}
                        </div>
                    </section>
                </div>
            </Modal>
        </div>
    );
}
