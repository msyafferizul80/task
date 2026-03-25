import Sidebar from "@/components/layout/Sidebar";
import RoleProvider from "@/components/layout/RoleProvider";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <RoleProvider>
            <div className="flex h-screen bg-gray-50 overflow-hidden print:h-auto print:overflow-visible print:block">
                <Sidebar />
                <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 pb-20 md:p-8 md:pb-8 print:h-auto print:p-0 print:overflow-visible print:bg-white">
                    {children}
                </main>
            </div>
        </RoleProvider>
    );
}
