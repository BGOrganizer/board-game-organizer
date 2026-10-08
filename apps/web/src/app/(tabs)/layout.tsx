import { MobileNumberGate } from "@/components/auth/MobileNumberGate";
import { Header } from "@/components/common/layout/Header";
import { WebDataWarmup } from "@/components/common/startup/WebDataWarmup";

export default function TabsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <MobileNumberGate>
      <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
        <WebDataWarmup />
        <Header />
        <main
          id="tab-content-scroll"
          className="mx-auto min-h-0 w-full max-w-7xl flex-1 overflow-y-auto overscroll-contain scroll-pb-28 px-3 pt-6 pb-28 sm:px-6 sm:pt-10 lg:px-8"
        >
          {children}
        </main>
      </div>
    </MobileNumberGate>
  );
}
