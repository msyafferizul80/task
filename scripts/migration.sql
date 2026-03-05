
-- Disable RLS for migration if needed (or assume admin role)
-- Organizations
INSERT INTO lv_organizations (id, name, logo, state_id, industry, created_at) VALUES 
('5b59835d-7f87-4c2a-b1ec-1c43be7f12a4', 'Benchmark Property Management Sdn Bhd', null, 'SGR', 'Building Management', '2026-01-10 13:27:30.33122+00'),
('365a67aa-0c47-4b43-aed9-e4bbcf68096f', 'Syazna World', null, 'SGR', 'Main', '2026-01-10 14:27:16.634095+00')
ON CONFLICT (id) DO NOTHING;

-- Leave Types
INSERT INTO lv_types (id, organization_id, name, min_notice, is_pro_rated, allow_backdated, created_at, requires_attachment, requires_remark) VALUES 
('95460e81-7b3a-462d-86d3-2918349f1e67', '5b59835d-7f87-4c2a-b1ec-1c43be7f12a4', 'Medical Leave', 0, false, false, '2026-01-10 16:19:27.176639+00', true, true),
('01fd98ed-f30e-4ac1-aef6-f95ba9777ada', '5b59835d-7f87-4c2a-b1ec-1c43be7f12a4', 'Emergency Leave', 0, false, false, '2026-01-10 16:19:44.051984+00', false, true),
('5cedf0cd-e7ea-41c5-80a9-1fc8e1058423', '5b59835d-7f87-4c2a-b1ec-1c43be7f12a4', 'Annual Leave', 3, true, false, '2026-01-10 16:19:06.591208+00', false, false)
ON CONFLICT (id) DO NOTHING;

-- Profiles (Upsert)
INSERT INTO lv_profiles (id, organization_id, full_name, role, join_date, probation_end_date, custom_al_entitlement, status, created_at, avatar_url, phone, email, manager_id) VALUES 
('64ca01ff-713a-4725-8081-a0c53eb05737', '365a67aa-0c47-4b43-aed9-e4bbcf68096f', 'Megat Syafferizul', 'super_admin', '2020-09-09', null, 12, 'active', '2026-01-09 11:30:31.466523+00', 'https://xmiiihdxctldkawnzfff.supabase.co/storage/v1/object/public/avatars/64ca01ff-713a-4725-8081-a0c53eb05737/avatar-1768054065846.jpg', null, null, null),
('b6a36e4f-a999-415f-ac10-09d1c3fef03c', '5b59835d-7f87-4c2a-b1ec-1c43be7f12a4', 'Megat Benchmark', 'tenant_admin', '2025-12-01', null, 12, 'active', '2026-01-10 15:34:22.443068+00', null, '+60123456789', 'sheffi80@gmail.com', null),
('0ca035c1-9a58-46e0-96de-af1204d4f0d3', '5b59835d-7f87-4c2a-b1ec-1c43be7f12a4', 'Megat Manager', 'manager', '2025-03-03', null, 8, 'active', '2026-01-12 01:51:01.211343+00', null, '', 'syafferizul@gmail.com', null),
('48ba2260-6b40-4533-b438-8eeeead6f1a7', '5b59835d-7f87-4c2a-b1ec-1c43be7f12a4', 'Megat Pekerja', 'employee', '2025-02-03', null, 8, 'active', '2026-01-12 01:54:03.98139+00', null, '', 'majikanpedia@gmail.com', '0ca035c1-9a58-46e0-96de-af1204d4f0d3'),
('37f6e9d2-3227-4d8b-97ff-53851cd88fc5', '5b59835d-7f87-4c2a-b1ec-1c43be7f12a4', 'Megat Pekerja 2', 'employee', '2025-09-01', null, 8, 'active', '2026-01-15 01:44:37.651965+00', null, '', 'marketing.empirekerjaya@gmail.com', '0ca035c1-9a58-46e0-96de-af1204d4f0d3')
ON CONFLICT (id) DO UPDATE SET
organization_id = EXCLUDED.organization_id,
full_name = EXCLUDED.full_name,
role = EXCLUDED.role,
join_date = EXCLUDED.join_date,
custom_al_entitlement = EXCLUDED.custom_al_entitlement,
manager_id = EXCLUDED.manager_id,
email = EXCLUDED.email;

-- Balances
INSERT INTO lv_balances (id, profile_id, leave_type_id, earned_amount, taken_amount, last_updated_at) VALUES 
('2fd92416-42bb-4a50-bcb5-bb19a92aa5ab', 'b6a36e4f-a999-415f-ac10-09d1c3fef03c', '01fd98ed-f30e-4ac1-aef6-f95ba9777ada', 0.00, 0.00, '2026-01-10 16:20:05.057386+00'),
('4cc1986e-3134-49cd-955e-9d94645c668b', 'b6a36e4f-a999-415f-ac10-09d1c3fef03c', '95460e81-7b3a-462d-86d3-2918349f1e67', 14.00, 0.00, '2026-01-10 16:20:22.209+00'),
('a1843c6e-1212-4572-9907-e27f67a84054', 'b6a36e4f-a999-415f-ac10-09d1c3fef03c', '5cedf0cd-e7ea-41c5-80a9-1fc8e1058423', 1.00, 0.00, '2026-01-10 16:46:36.94901+00'),
('4dc1b3f5-08f7-4af5-9d6c-23ed23917e15', '48ba2260-6b40-4533-b438-8eeeead6f1a7', '01fd98ed-f30e-4ac1-aef6-f95ba9777ada', 0.00, 0.00, '2026-01-14 05:37:07.664631+00'),
('4a885edc-6fd8-4fff-9e7a-840ef6d503ee', '48ba2260-6b40-4533-b438-8eeeead6f1a7', '95460e81-7b3a-462d-86d3-2918349f1e67', 14.00, 0.00, '2026-01-14 05:37:29.697+00'),
('3f5c1b40-b62e-4a71-bbc1-608c0b24fd86', '48ba2260-6b40-4533-b438-8eeeead6f1a7', '5cedf0cd-e7ea-41c5-80a9-1fc8e1058423', 1.00, 3.00, '2026-01-15 00:50:49.059398+00'),
('06a7f3d0-91d4-4285-b541-d9f03e596bb8', '37f6e9d2-3227-4d8b-97ff-53851cd88fc5', '01fd98ed-f30e-4ac1-aef6-f95ba9777ada', 0.00, 0.00, '2026-01-15 01:45:34.272066+00'),
('f7ad2590-fd00-4c63-99a6-600cd9823e76', '37f6e9d2-3227-4d8b-97ff-53851cd88fc5', '95460e81-7b3a-462d-86d3-2918349f1e67', 0.00, 0.00, '2026-01-15 01:45:34.456399+00'),
('fcd9e9fc-3710-4213-84eb-fde1b45562aa', '37f6e9d2-3227-4d8b-97ff-53851cd88fc5', '5cedf0cd-e7ea-41c5-80a9-1fc8e1058423', 0.67, 0.50, '2026-01-15 01:45:34.035413+00')
ON CONFLICT (id) DO NOTHING;

-- Applications
INSERT INTO lv_applications (id, profile_id, organization_id, leave_type_id, start_date, end_date, total_days, status, attachment_url, is_emergency, reason, reviewed_by, reviewed_at, created_at, rejection_reason) VALUES 
('7183b2d9-75c5-4550-b033-c22df1479d06', '48ba2260-6b40-4533-b438-8eeeead6f1a7', '5b59835d-7f87-4c2a-b1ec-1c43be7f12a4', '95460e81-7b3a-462d-86d3-2918349f1e67', '2026-01-14', '2026-01-14', 1.00, 'rejected', 'https://xmiiihdxctldkawnzfff.supabase.co/storage/v1/object/public/leave_attachments/48ba2260-6b40-4533-b438-8eeeead6f1a7/1768370372056.pdf', false, 'demam', '0ca035c1-9a58-46e0-96de-af1204d4f0d3', '2026-01-14 06:11:43.099+00', '2026-01-14 05:59:30.843478+00', 'tolong tambah attachment lain'),
('f924bf56-a15c-433e-a235-d84013d0ace8', '48ba2260-6b40-4533-b438-8eeeead6f1a7', '5b59835d-7f87-4c2a-b1ec-1c43be7f12a4', '5cedf0cd-e7ea-41c5-80a9-1fc8e1058423', '2026-01-21', '2026-01-23', 3.00, 'approved', null, false, '', '0ca035c1-9a58-46e0-96de-af1204d4f0d3', '2026-01-14 06:11:55.578+00', '2026-01-14 05:43:51.296745+00', null),
('cbb18a8b-925b-4b55-9b5a-86c41cd44847', '37f6e9d2-3227-4d8b-97ff-53851cd88fc5', '5b59835d-7f87-4c2a-b1ec-1c43be7f12a4', '5cedf0cd-e7ea-41c5-80a9-1fc8e1058423', '2026-01-21', '2026-01-21', 0.50, 'rejected', null, false, '', '0ca035c1-9a58-46e0-96de-af1204d4f0d3', '2026-01-15 02:13:35.041+00', '2026-01-15 02:07:02.967348+00', 'apa laa'),
('7375e8d0-7e52-4860-9d72-cffa36c278dc', '37f6e9d2-3227-4d8b-97ff-53851cd88fc5', '5b59835d-7f87-4c2a-b1ec-1c43be7f12a4', '5cedf0cd-e7ea-41c5-80a9-1fc8e1058423', '2026-01-21', '2026-01-21', 0.50, 'approved', null, false, '', '0ca035c1-9a58-46e0-96de-af1204d4f0d3', '2026-01-15 04:37:11.418+00', '2026-01-15 02:33:43.102806+00', null)
ON CONFLICT (id) DO NOTHING;
