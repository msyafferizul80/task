'use client'

import React, { useEffect, useState } from 'react';
import { Form, Input, Button, message, Card, Divider, Tag } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, SafetyOutlined } from '@ant-design/icons';
import { createClient } from '@/utils/supabase/client';
import { useRole } from '@/components/layout/RoleProvider';

export default function ProfilePage() {
    const supabase = createClient();
    const { role, userId } = useRole();
    const [profileForm] = Form.useForm();
    const [passwordForm] = Form.useForm();

    const [loadingProfile, setLoadingProfile] = useState(true);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isSavingPassword, setIsSavingPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState('');

    useEffect(() => {
        if (!userId) return;

        const loadProfile = async () => {
            try {
                setLoadingProfile(true);
                const { data, error } = await supabase
                    .from('lv_profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (error) throw error;

                if (data) {
                    profileForm.setFieldsValue({ full_name: data.full_name });
                    setEmail(data.email || '');
                    setStatus(data.status || 'unknown');
                }
            } catch (error: any) {
                console.error('Error fetching profile:', error);
                message.error('Failed to load profile data.');
            } finally {
                setLoadingProfile(false);
            }
        };

        loadProfile();
    }, [userId, supabase, profileForm]);

    const handleUpdateProfile = async (values: { full_name: string }) => {
        if (!userId) return;
        setIsSavingProfile(true);
        try {
            const { error } = await supabase
                .from('lv_profiles')
                .update({ full_name: values.full_name })
                .eq('id', userId);

            if (error) throw error;
            message.success('Profile details updated successfully');
        } catch (error: any) {
            console.error('Error updating profile:', error);
            message.error(error.message || 'Failed to update profile');
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleUpdatePassword = async (values: any) => {
        if (values.new_password !== values.confirm_password) {
            message.error('Passwords do not match!');
            return;
        }

        setIsSavingPassword(true);
        try {
            const { error } = await supabase.auth.updateUser({
                password: values.new_password
            });

            if (error) throw error;

            message.success('Password updated successfully!');
            passwordForm.resetFields();
        } catch (error: any) {
            console.error('Error updating password:', error);
            message.error(error.message || 'Failed to update password');
        } finally {
            setIsSavingPassword(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">My Profile</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left Column: Read-only info & Basic Profile */}
                <div className="md:col-span-2 space-y-6">
                    <Card title="Personal Information" className="shadow-sm border-gray-100">
                        {loadingProfile ? (
                            <div className="space-y-4 animate-pulse">
                                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                                <div className="h-10 bg-gray-100 rounded w-full mb-4"></div>
                                <div className="h-4 bg-gray-200 rounded w-1/4 mt-4"></div>
                                <div className="h-10 bg-gray-100 rounded w-full mb-6"></div>
                                <div className="h-10 bg-gray-200 rounded w-32"></div>
                            </div>
                        ) : (
                            <Form
                                form={profileForm}
                                layout="vertical"
                                onFinish={handleUpdateProfile}
                            >
                                <Form.Item
                                    name="full_name"
                                    label="Full Name"
                                    rules={[{ required: true, message: 'Please enter your full name' }]}
                                >
                                    <Input prefix={<UserOutlined className="text-gray-400" />} size="large" />
                                </Form.Item>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address (Read Only)</label>
                                    <Input
                                        value={email}
                                        disabled
                                        prefix={<MailOutlined />}
                                        size="large"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Please contact your administrator to change your email.</p>
                                </div>

                                <Form.Item>
                                    <Button type="primary" htmlType="submit" loading={isSavingProfile} size="large">
                                        Save Changes
                                    </Button>
                                </Form.Item>
                            </Form>
                        )}
                    </Card>

                    <Card title="Security: Change Password" className="shadow-sm border-gray-100">
                        <Form
                            form={passwordForm}
                            layout="vertical"
                            onFinish={handleUpdatePassword}
                        >
                            <Form.Item
                                name="new_password"
                                label="New Password"
                                rules={[
                                    { required: true, message: 'Please input your new password!' },
                                    { min: 6, message: 'Password must be at least 6 characters.' }
                                ]}
                            >
                                <Input.Password prefix={<LockOutlined className="text-gray-400" />} size="large" />
                            </Form.Item>

                            <Form.Item
                                name="confirm_password"
                                label="Confirm New Password"
                                rules={[{ required: true, message: 'Please confirm your new password!' }]}
                            >
                                <Input.Password prefix={<LockOutlined className="text-gray-400" />} size="large" />
                            </Form.Item>

                            <Form.Item>
                                <Button type="default" htmlType="submit" loading={isSavingPassword} size="large" className="w-full sm:w-auto">
                                    Update Password
                                </Button>
                            </Form.Item>
                        </Form>
                    </Card>
                </div>

                {/* Right Column: Account Status / Meta */}
                <div className="space-y-6">
                    <Card title="Account Status" className="shadow-sm border-gray-100 bg-gray-50">
                        <div className="space-y-4">
                            <div>
                                <p className="text-sm text-gray-500 mb-1">Role</p>
                                <Tag color={role === 'admin' ? 'purple' : role === 'manager' ? 'cyan' : 'blue'} className="text-sm px-3 py-1">
                                    {role?.toUpperCase() || 'UNKNOWN'}
                                </Tag>
                            </div>

                            <Divider className="my-3" />

                            <div>
                                <p className="text-sm text-gray-500 mb-1">Status</p>
                                <div className="flex items-center gap-2">
                                    <SafetyOutlined className={status === 'active' ? 'text-green-500' : 'text-red-500'} />
                                    <span className={`font-medium ${status === 'active' ? 'text-green-700' : 'text-red-700'}`}>
                                        {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
