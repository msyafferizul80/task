'use client';

import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, message, Tag, Select } from 'antd';
const { Option } = Select;
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { createClient } from '@/utils/supabase/client';
import { useRole } from '@/components/layout/RoleProvider';

export default function UsersPage() {
    const supabase = createClient();
    const { role } = useRole();
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [form] = Form.useForm();
    const [editingId, setEditingId] = useState<string | null>(null);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('lv_profiles')
                .select('*')
                .order('full_name');

            if (!error && data) {
                // Sort: active first, then inactive/suspended — alphabetically within each group
                data.sort((a: any, b: any) => {
                    const statusOrder = (s: string) => (s === 'active' ? 0 : 1);
                    const diff = statusOrder(a.status) - statusOrder(b.status);
                    if (diff !== 0) return diff;
                    return (a.full_name || '').localeCompare(b.full_name || '');
                });
            }

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
        setIsSubmitting(true);
        try {
            if (editingId) {
                // Update existing user profile
                const { error } = await supabase
                    .from('lv_profiles')
                    .update({ 
                        full_name: values.full_name, 
                        role: values.role, 
                        status: values.status,
                        department: values.department || null
                    })
                    .eq('id', editingId);

                if (error) throw error;
                message.success('User updated successfully');
            } else {
                // Create new user via API route
                const res = await fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(values)
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || 'Failed to create user');
                }

                message.success('New user created successfully');
            }

            setIsModalOpen(false);
            form.resetFields();
            fetchUsers();
        } catch (error: any) {
            console.error('Error saving user:', error.message);
            message.error(error.message || 'Failed to save user');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = (record: any) => {
        Modal.confirm({
            title: 'Delete User Account',
            content: `Are you sure you want to permanently delete ${record.full_name}? This action cannot be undone and will remove their access to the system.`,
            okText: 'Yes, Delete',
            okType: 'danger',
            cancelText: 'Cancel',
            onOk: async () => {
                try {
                    const res = await fetch('/api/users', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: record.id })
                    });
                    
                    const data = await res.json();
                    if (!res.ok) {
                        throw new Error(data.error || 'Failed to delete user');
                    }
                    message.success('User deleted successfully');
                    fetchUsers();
                } catch (error: any) {
                    console.error('Delete error:', error);
                    message.error(error.message || 'Failed to delete user');
                }
            }
        });
    };

    const openEditModal = (record: any) => {
        setEditingId(record.id);
        form.setFieldsValue(record);
        setIsModalOpen(true);
    };

    const openCreateModal = () => {
        setEditingId(null);
        form.resetFields();
        // Set default values for new user
        form.setFieldsValue({ status: 'active' });
        setIsModalOpen(true);
    };

    const columns = [
        { title: 'Full Name', dataIndex: 'full_name', key: 'full_name' },
        { title: 'Email', dataIndex: 'email', key: 'email' },
        {
            title: 'Role',
            dataIndex: 'role',
            key: 'role',
            render: (role: string) => {
                let color = 'blue';
                if (role === 'admin') color = 'purple';
                if (role === 'manager') color = 'orange';
                if (role === 'supervisor') color = 'green';
                return <Tag color={color}>{role?.toUpperCase() || 'USER'}</Tag>;
            }
        },
        { title: 'Department', dataIndex: 'department', key: 'department', render: (dept: string) => dept || '—' },
        { title: 'Status', dataIndex: 'status', key: 'status' },
        {
            title: 'Action',
            key: 'action',
            render: (_: any, record: any) => (
                <div className="flex gap-2">
                    <Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
                    {role === 'admin' && (
                        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} />
                    )}
                </div>
            )
        }
    ];

    if (role && role !== 'admin') {
        return (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex flex-col items-center justify-center h-64 text-center">
                <h2 className="text-xl font-bold text-gray-800 mb-2">Access Denied</h2>
                <p className="text-gray-500">You do not have permission to view this page. Only administrators can manage users.</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">User Management</h1>
                    <p className="text-gray-500 text-sm">Manage staff & PICs (Editing Profiles)</p>
                </div>
                <Button type="primary" onClick={openCreateModal} icon={<PlusOutlined />}>
                    Add New User
                </Button>
            </div>

            <Table
                columns={columns}
                dataSource={users}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10 }}
                rowClassName={(record: any) =>
                    record.status !== 'active' ? 'opacity-50' : ''
                }
            />

            <Modal
                title={editingId ? "Edit User Profile" : "Add New User"}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                onOk={() => form.submit()}
                confirmLoading={isSubmitting}
                okText={editingId ? "Save Profile" : "Create User"}
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <Form.Item name="full_name" label="Full Name" rules={[{ required: true, message: 'Please enter full name' }]}>
                        <Input />
                    </Form.Item>

                    <Form.Item name="email" label="Email" rules={[
                        { required: true, message: 'Please enter email' },
                        { type: 'email', message: 'Please enter a valid email' }
                    ]}>
                        <Input disabled={!!editingId} />
                    </Form.Item>

                    {!editingId && (
                        <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Please enter a temporary password' }]}>
                            <Input.Password />
                        </Form.Item>
                    )}

                    <Form.Item name="role" label="Role" rules={[{ required: true, message: 'Please select a role' }]}>
                        <Select placeholder="Select a role">
                            <Option value="admin">Admin</Option>
                            <Option value="manager">Manager</Option>
                            <Option value="supervisor">Supervisor</Option>
                            <Option value="employee">Employee</Option>
                        </Select>
                    </Form.Item>

                    <Form.Item 
                        noStyle 
                        shouldUpdate={(prevValues, currentValues) => prevValues.role !== currentValues.role}
                    >
                        {({ getFieldValue }) => {
                            const selectedRole = getFieldValue('role');
                            if (selectedRole === 'supervisor') {
                                return (
                                    <Form.Item 
                                        name="department" 
                                        label="Department" 
                                        rules={[{ required: true, message: 'Please select a department for the supervisor' }]}
                                    >
                                        <Select placeholder="Select a department">
                                            <Option value="Outsourcing">Outsourcing</Option>
                                            <Option value="IT">IT</Option>
                                            <Option value="Sales">Sales</Option>
                                            <Option value="Marketing">Marketing</Option>
                                            <Option value="Recruitment">Recruitment</Option>
                                            <Option value="Management">Management</Option>
                                            <Option value="Account">Account</Option>
                                        </Select>
                                    </Form.Item>
                                );
                            }
                            return (
                                <Form.Item 
                                    name="department" 
                                    label="Department (Optional)"
                                >
                                    <Select placeholder="Select a department" allowClear>
                                        <Option value="Outsourcing">Outsourcing</Option>
                                        <Option value="IT">IT</Option>
                                        <Option value="Sales">Sales</Option>
                                        <Option value="Marketing">Marketing</Option>
                                        <Option value="Recruitment">Recruitment</Option>
                                        <Option value="Management">Management</Option>
                                        <Option value="Account">Account</Option>
                                    </Select>
                                </Form.Item>
                            );
                        }}
                    </Form.Item>

                    <Form.Item name="status" label="Status" rules={[{ required: true, message: 'Please select a status' }]}>
                        <Select placeholder="Select a status">
                            <Option value="active">Active</Option>
                            <Option value="inactive">Inactive</Option>
                            <Option value="suspended">Suspended</Option>
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
