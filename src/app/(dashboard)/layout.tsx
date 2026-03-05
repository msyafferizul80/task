import Sidebar from "@/components/layout/Sidebar";
import RoleProvider from "@/components/layout/RoleProvider";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <RoleProvider>
            <div className="flex h-screen bg-gray-50 overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-y-auto p-8">
                    {children}
                </main>
            </div>
        </RoleProvider>
    );
}
