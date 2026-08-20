'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, message, Tag, Select, Typography, Card, Space, Avatar, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UsergroupAddOutlined, TeamOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import { createClient } from '@/utils/supabase/client';
import { useRole } from '@/components/layout/RoleProvider';
import { Profile, ReviewGroup } from '@/lib/types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

export const formatUserRoleLabel = (p: { full_name?: string; role?: string; department?: string | null }) => {
    const roleCapitalized = p.role ? (p.role.charAt(0).toUpperCase() + p.role.slice(1).toLowerCase()) : '';
    
    // For Admin / Manager: global scope -> role only, e.g. "En Hafiz (Manager)"
    if (p.role === 'admin' || p.role === 'manager') {
        return `${p.full_name} (${roleCapitalized})`;
    }
    
    // For Supervisor / Employee: department scoped -> role + department, e.g. "Cik Arina (Supervisor · Outsourcing)"
    if (p.department) {
        return `${p.full_name} (${roleCapitalized} · ${p.department})`;
    }
    
    return `${p.full_name} (${roleCapitalized || 'Staff'})`;
};

export default function ReviewGroupsPage() {
    const supabase = createClient();
    const { role } = useRole();
    const [reviewGroups, setReviewGroups] = useState<ReviewGroup[]>([]);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [form] = Form.useForm();
    const [editingGroup, setEditingGroup] = useState<ReviewGroup | null>(null);

    const fetchReviewGroups = useCallback(async () => {
        try {
            setLoading(true);

            // Fetch groups, members, and active review-eligible profiles (Admin, Manager, Supervisor) in parallel
            const [groupsRes, membersRes, profilesRes] = await Promise.all([
                supabase
                    .from('tsk_review_groups')
                    .select('*')
                    .order('created_at', { ascending: false }),
                supabase
                    .from('tsk_review_group_members')
                    .select(`
                        group_id,
                        user_id,
                        profile:lv_profiles!tsk_review_group_members_user_id_fkey (
                            id,
                            full_name,
                            avatar_url,
                            department,
                            role
                        )
                    `),
                supabase
                    .from('lv_profiles')
                    .select('id, full_name, avatar_url, department, role')
                    .eq('status', 'active')
                    .in('role', ['admin', 'manager', 'supervisor'])
                    .order('full_name')
            ]);

            // Set profiles for the modal dropdown
            if (profilesRes.data) {
                setProfiles(profilesRes.data);
            }

            if (groupsRes.error) {
                if (groupsRes.error.code === 'PGRST205' || groupsRes.error.code === '42P01') {
                    console.warn('Jadual tsk_review_groups belum dicipta di Supabase.');
                } else {
                    throw groupsRes.error;
                }
            }

            if (membersRes.error && membersRes.error.code !== 'PGRST205' && membersRes.error.code !== '42P01') {
                throw membersRes.error;
            }

            const groups = groupsRes.data || [];
            const members = membersRes.data || [];

            // Map members to groups
            const groupMap: Record<string, Profile[]> = {};
            members.forEach((m: any) => {
                if (!groupMap[m.group_id]) {
                    groupMap[m.group_id] = [];
                }
                if (m.profile) {
                    groupMap[m.group_id].push(m.profile);
                }
            });

            const enrichedGroups: ReviewGroup[] = groups.map((g: any) => ({
                ...g,
                members: groupMap[g.id] || [],
                member_count: (groupMap[g.id] || []).length
            }));

            setReviewGroups(enrichedGroups);
        } catch (err: any) {
            console.error('Error fetching review groups:', err.message);
            message.error('Gagal memuatkan Kumpulan Semakan: ' + err.message);
        } finally {
            setLoading(false);
        }
    }, [supabase]);

    useEffect(() => {
        fetchReviewGroups();

        const channelGroups = supabase
            .channel('review-groups-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tsk_review_groups' }, () => {
                fetchReviewGroups();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tsk_review_group_members' }, () => {
                fetchReviewGroups();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channelGroups);
        };
    }, [fetchReviewGroups, supabase]);

    const handleOpenCreateModal = () => {
        setEditingGroup(null);
        form.resetFields();
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (group: ReviewGroup) => {
        setEditingGroup(group);
        form.setFieldsValue({
            name: group.name,
            member_ids: (group.members || []).map(m => m.id)
        });
        setIsModalOpen(true);
    };

    const handleSave = async (values: any) => {
        setIsSubmitting(true);
        try {
            const { name, member_ids = [] } = values;

            if (editingGroup) {
                // Update group name
                const { error: updateError } = await supabase
                    .from('tsk_review_groups')
                    .update({ name })
                    .eq('id', editingGroup.id);

                if (updateError) throw updateError;

                // Sync members: delete existing and re-insert
                const { error: deleteMembersError } = await supabase
                    .from('tsk_review_group_members')
                    .delete()
                    .eq('group_id', editingGroup.id);

                if (deleteMembersError) throw deleteMembersError;

                if (member_ids.length > 0) {
                    const memberRows = member_ids.map((uid: string) => ({
                        group_id: editingGroup.id,
                        user_id: uid
                    }));
                    const { error: insertMembersError } = await supabase
                        .from('tsk_review_group_members')
                        .insert(memberRows);

                    if (insertMembersError) throw insertMembersError;
                }

                message.success('Kumpulan Semakan berjaya dikemaskini!');
            } else {
                // Create new group
                const { data: userData } = await supabase.auth.getUser();
                const { data: newGroup, error: createError } = await supabase
                    .from('tsk_review_groups')
                    .insert({
                        name,
                        created_by: userData?.user?.id || null
                    })
                    .select('id')
                    .single();

                if (createError) throw createError;

                if (member_ids.length > 0 && newGroup?.id) {
                    const memberRows = member_ids.map((uid: string) => ({
                        group_id: newGroup.id,
                        user_id: uid
                    }));
                    const { error: insertMembersError } = await supabase
                        .from('tsk_review_group_members')
                        .insert(memberRows);

                    if (insertMembersError) throw insertMembersError;
                }

                message.success('Kumpulan Semakan baru berjaya dicipta!');
            }

            setIsModalOpen(false);
            form.resetFields();
            fetchReviewGroups();
        } catch (err: any) {
            console.error('Error saving review group:', err.message);
            message.error('Gagal menyimpan Kumpulan Semakan: ' + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = (group: ReviewGroup) => {
        Modal.confirm({
            title: 'Padam Kumpulan Semakan',
            icon: <ExclamationCircleFilled className="text-red-500" />,
            content: `Adakah anda pasti untuk memadam kumpulan "${group.name}"? Ahli kumpulan ini tidak lagi akan menerima semakan bersama.`,
            okText: 'Padam',
            okType: 'danger',
            cancelText: 'Batal',
            centered: true,
            onOk: async () => {
                try {
                    const { error } = await supabase
                        .from('tsk_review_groups')
                        .delete()
                        .eq('id', group.id);

                    if (error) throw error;
                    message.success('Kumpulan Semakan telah dipadam.');
                    fetchReviewGroups();
                } catch (err: any) {
                    console.error('Error deleting group:', err.message);
                    message.error('Gagal memadam kumpulan: ' + err.message);
                }
            }
        });
    };

    if (role && role !== 'admin') {
        return (
            <div className="p-8 text-center">
                <Card className="max-w-md mx-auto shadow-sm">
                    <Title level={4} className="text-rose-600">Akses Terhad</Title>
                    <Text type="secondary">
                        Hanya pentadbir (Admin) yang dibenarkan menguruskan Kumpulan Semakan.
                    </Text>
                </Card>
            </div>
        );
    }

    const columns = [
        {
            title: 'Nama Kumpulan',
            dataIndex: 'name',
            key: 'name',
            render: (text: string) => (
                <div className="flex items-center gap-2">
                    <TeamOutlined className="text-indigo-600 text-lg" />
                    <span className="font-semibold text-slate-800">{text}</span>
                </div>
            )
        },
        {
            title: 'Bilangan Ahli',
            dataIndex: 'member_count',
            key: 'member_count',
            width: 130,
            render: (count: number) => (
                <Tag color={count > 0 ? 'blue' : 'default'} className="font-medium">
                    {count} Ahli
                </Tag>
            )
        },
        {
            title: 'Senarai Ahli',
            dataIndex: 'members',
            key: 'members',
            render: (members: Profile[]) => {
                if (!members || members.length === 0) {
                    return <Text type="secondary" className="italic text-xs">Tiada ahli</Text>;
                }
                return (
                    <div className="flex flex-wrap gap-1.5 items-center">
                        {members.map(m => {
                            const roleCap = m.role ? (m.role.charAt(0).toUpperCase() + m.role.slice(1).toLowerCase()) : '';
                            const scopeLabel = (m.role === 'admin' || m.role === 'manager')
                                ? roleCap
                                : (m.department ? `${roleCap} · ${m.department}` : (roleCap || 'Staff'));

                            return (
                                <Tooltip key={m.id} title={formatUserRoleLabel(m)}>
                                    <Tag className="rounded-full px-2.5 py-0.5 bg-slate-50 border-slate-200 text-slate-700 flex items-center gap-1.5">
                                        <Avatar size={16} className={`${m.role === 'admin' || m.role === 'manager' ? 'bg-purple-600' : 'bg-indigo-500'} text-[10px]`}>
                                            {m.full_name ? m.full_name.charAt(0).toUpperCase() : 'U'}
                                        </Avatar>
                                        <span className="text-xs font-medium">{m.full_name}</span>
                                        <span className="text-[10px] text-slate-500 font-mono">({scopeLabel})</span>
                                    </Tag>
                                </Tooltip>
                            );
                        })}
                    </div>
                );
            }
        },
        {
            title: 'Tarikh Dicipta',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 140,
            render: (val: string) => (
                <Text type="secondary" className="text-xs">
                    {dayjs(val).format('DD/MM/YYYY')}
                </Text>
            )
        },
        {
            title: 'Tindakan',
            key: 'actions',
            width: 120,
            render: (_: any, record: ReviewGroup) => (
                <Space size="small">
                    <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined className="text-blue-600" />}
                        onClick={() => handleOpenEditModal(record)}
                    />
                    <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record)}
                    />
                </Space>
            )
        }
    ];

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div>
                    <Title level={2} className="!mb-1 font-bold text-slate-800 flex items-center gap-2">
                        <UsergroupAddOutlined className="text-indigo-600" />
                        Pengurusan Kumpulan Semakan
                    </Title>
                    <Text type="secondary">
                        Urus kumpulan semakan bertingkat untuk pembahagian tugas semakan dan mengelakkan bottleneck.
                    </Text>
                </div>
                <Button
                    type="primary"
                    size="large"
                    icon={<PlusOutlined />}
                    className="bg-indigo-600 hover:bg-indigo-700 shadow-md font-semibold border-none rounded-xl"
                    onClick={handleOpenCreateModal}
                >
                    Tambah Kumpulan
                </Button>
            </div>

            <Card className="rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <Table
                    columns={columns}
                    dataSource={reviewGroups}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10, showSizeChanger: true }}
                    locale={{ emptyText: 'Tiada Kumpulan Semakan ditemui. Sila tambah kumpulan baru.' }}
                />
            </Card>

            <Modal
                title={
                    <div className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <TeamOutlined className="text-indigo-600" />
                        {editingGroup ? 'Kemaskini Kumpulan Semakan' : 'Cipta Kumpulan Semakan Baru'}
                    </div>
                }
                open={isModalOpen}
                onCancel={() => {
                    setIsModalOpen(false);
                    form.resetFields();
                }}
                footer={null}
                destroyOnClose
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSave}
                    className="mt-4"
                >
                    <Form.Item
                        name="name"
                        label="Nama Kumpulan Semakan"
                        rules={[{ required: true, message: 'Sila masukkan nama kumpulan' }]}
                    >
                        <Input placeholder="Contoh: Technical Lead, Operation Reviewers, QA Panel" size="large" />
                    </Form.Item>

                    <Form.Item
                        name="member_ids"
                        label="Pilih Ahli Kumpulan"
                        tooltip="Mana-mana ahli dalam kumpulan ini boleh meluluskan atau menolak tugasan yang dieskalasikan kepada kumpulan."
                    >
                        <Select
                            mode="multiple"
                            placeholder="Pilih kakitangan untuk kumpulan ini"
                            size="large"
                            showSearch
                            optionFilterProp="children"
                            className="w-full"
                        >
                            {profiles.map(p => (
                                <Option key={p.id} value={p.id}>
                                    {formatUserRoleLabel(p)}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <div className="flex justify-end gap-3 pt-4 border-t mt-6">
                        <Button onClick={() => setIsModalOpen(false)} disabled={isSubmitting} size="large">
                            Batal
                        </Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={isSubmitting}
                            size="large"
                            className="bg-indigo-600 hover:bg-indigo-700 shadow-md border-none"
                        >
                            {editingGroup ? 'Simpan Perubahan' : 'Cipta Kumpulan'}
                        </Button>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}
