import { Header } from "@/components/Header";

export default function TabsLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <div className="min-h-screen">
            <Header />
            <main className="mx-auto max-w-2xl px-4 py-12">
                {children}
            </main>
        </div>
    );
}