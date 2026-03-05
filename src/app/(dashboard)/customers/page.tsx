'use client';

import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { createClient } from '@/utils/supabase/client';

export default function CustomersPage() {
    const supabase = createClient();
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form] = Form.useForm();
    const [editingId, setEditingId] = useState<string | null>(null);

    const fetchCustomers = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('tsk_customers')
                .select('*')
                .order('name');

            if (error) {
                if (error.code === '42P01') {
                    // Table doesn't exist yet, we will notify the user.
                    message.error('The tsk_customers table does not exist. Please run the SQL migration.');
                } else {
                    throw error;
                }
            } else {
                setCustomers(data || []);
            }
        } catch (error: any) {
            console.error('Error fetching customers:', error.message);
            message.error('Failed to load customers');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCustomers();
    }, []);

    const handleSave = async (values: any) => {
        try {
            if (editingId) {
                const { error } = await supabase
                    .from('tsk_customers')
                    .update(values)
                    .eq('id', editingId);

                if (error) throw error;
                message.success('Customer updated successfully');
            } else {
                const { error } = await supabase
                    .from('tsk_customers')
                    .insert([values]);

                if (error) throw error;
                message.success('Customer created successfully');
            }

            setIsModalOpen(false);
            form.resetFields();
            fetchCustomers();
        } catch (error: any) {
            console.error('Error saving customer:', error.message);
            message.error('Failed to save customer');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const { error } = await supabase
                .from('tsk_customers')
                .delete()
                .eq('id', id);

            if (error) throw error;
            message.success('Customer deleted successfully');
            fetchCustomers();
        } catch (error: any) {
            console.error('Error deleting customer:', error.message);
            message.error('Failed to delete customer (It might be linked to existing tasks)');
        }
    };

    const openEditModal = (record: any) => {
        setEditingId(record.id);
        form.setFieldsValue(record);
        setIsModalOpen(true);
    };

    const openCreateModal = () => {
        setEditingId(null);
        form.resetFields();
        setIsModalOpen(true);
    };

    const columns = [
        { title: 'Customer Name', dataIndex: 'name', key: 'name' },
        { title: 'Email', dataIndex: 'email', key: 'email' },
        { title: 'Phone', dataIndex: 'phone', key: 'phone' },
        {
            title: 'Action',
            key: 'action',
            render: (_: any, record: any) => (
                <div className="flex gap-2">
                    <Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
                </div>
            )
        }
    ];

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Customer Management</h1>
                    <p className="text-gray-500 text-sm">Manage client details for dropdowns</p>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                    Add New Customer
                </Button>
            </div>

            <Table
                columns={columns}
                dataSource={customers}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10 }}
            />

            <Modal
                title={editingId ? "Edit Customer" : "Add New Customer"}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                onOk={() => form.submit()}
                okText={editingId ? "Save" : "Create"}
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <Form.Item name="name" label="Customer Name" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="email" label="Email Address">
                        <Input type="email" />
                    </Form.Item>
                    <Form.Item name="phone" label="Phone Number">
                        <Input />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
