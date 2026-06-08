import Sidebar from "@/components/layout/Sidebar";
import RoleProvider from "@/components/layout/RoleProvider";
import TimerProvider from "@/components/task/TimerProvider";
import BottleneckAlertBanner from "@/components/layout/BottleneckAlertBanner";
import ClientHoldAlertBanner from "@/components/layout/ClientHoldAlertBanner";
import SubmissionAlertBanner from "@/components/layout/SubmissionAlertBanner";
import ActiveTimersBar from "@/components/layout/ActiveTimersBar";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <RoleProvider>
            <TimerProvider>
                <div className="flex h-screen bg-gray-50 overflow-hidden print:h-auto print:overflow-visible print:block">
                    <Sidebar />
                    <div className="flex-1 flex flex-col overflow-hidden print:h-auto print:overflow-visible">
                        <BottleneckAlertBanner />
                        <ClientHoldAlertBanner />
                        <SubmissionAlertBanner />
                        <ActiveTimersBar />
                        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 pb-20 md:p-8 md:pb-8 print:h-auto print:p-0 print:overflow-visible print:bg-white">
                            {children}
                        </main>
                    </div>
                </div>
            </TimerProvider>
        </RoleProvider>
    );
}

