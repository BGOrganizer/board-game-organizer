import { Header } from "@/components/Header";
import { MobileNumberGate } from "@/components/MobileNumberGate";

export default function TabsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <MobileNumberGate>
      <div className="min-h-screen">
        <Header />
        <main className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-6 sm:py-10 lg:px-8">
          {children}
        </main>
      </div>
    </MobileNumberGate>
  );
}
