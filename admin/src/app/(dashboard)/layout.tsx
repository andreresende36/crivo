import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {

  return (
    <div className="flex h-screen overflow-hidden bg-background relative selection:bg-primary/30 text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative z-10">
        <Header />
        <div className="p-4 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
