'use client';

import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, message, Tag, Select } from 'antd';
const { Option } = Select;
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { createClient } from '@/utils/supabase/client';

export default function UsersPage() {
    const supabase = createClient();
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form] = Form.useForm();
    const [editingId, setEditingId] = useState<string | null>(null);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('lv_profiles')
                .select('*')
                .order('full_name');

            if (error) throw error;
            setUsers(data || []);
        } catch (error: any) {
            console.error('Error fetching users:', error.message);
            message.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleSave = async (values: any) => {
        try {
            if (editingId) {
                const { error } = await supabase
                    .from('lv_profiles')
                    .update({ full_name: values.full_name, email: values.email, role: values.role })
                    .eq('id', editingId);

                if (error) throw error;
                message.success('User updated successfully');
            } else {
                // To truly create a user, we normally use Supabase Auth Admin API
                // For this demo (if Admin API isn't exposed), we might hit an edge function or just insert if RLS allows
                // But generally users are created via Auth signup
                message.error('Please use the central auth system or invite link to add new users.');
                return;
            }

            setIsModalOpen(false);
            form.resetFields();
            fetchUsers();
        } catch (error: any) {
            console.error('Error saving user:', error.message);
            message.error('Failed to save user');
        }
    };

    const openEditModal = (record: any) => {
        setEditingId(record.id);
        form.setFieldsValue(record);
        setIsModalOpen(true);
    };

    const columns = [
        { title: 'Full Name', dataIndex: 'full_name', key: 'full_name' },
        { title: 'Email', dataIndex: 'email', key: 'email' },
        {
            title: 'Role',
            dataIndex: 'role',
            key: 'role',
            render: (role: string) => (
                <Tag color={role === 'admin' ? 'purple' : 'blue'}>{role?.toUpperCase() || 'USER'}</Tag>
            )
        },
        { title: 'Status', dataIndex: 'status', key: 'status' },
        {
            title: 'Action',
            key: 'action',
            render: (_: any, record: any) => (
                <div className="flex gap-2">
                    <Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
                </div>
            )
        }
    ];

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">User Management</h1>
                    <p className="text-gray-500 text-sm">Manage staff & PICs (Editing Profiles)</p>
                </div>
                {/* Note: In a real Syazna app, Add User requires Supabase Auth Signup */}
                <Button type="primary" disabled icon={<PlusOutlined />}>
                    Add New User (Via Root App)
                </Button>
            </div>

            <Table
                columns={columns}
                dataSource={users}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10 }}
            />

            <Modal
                title="Edit User Profile"
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                onOk={() => form.submit()}
                okText="Save Profile"
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="role" label="Role" rules={[{ required: true, message: 'Please select a role' }]}>
                        <Select placeholder="Select a role">
                            <Option value="admin">Admin</Option>
                            <Option value="user">User</Option>
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
