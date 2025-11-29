"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { Sidebar } from "../../components/layout/sidebar";
import { MobileNav } from "../../components/layout/mobile-nav";
import { authClient } from "../../lib/auth-client";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user as { role?: string } | undefined;
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.push("/");
    }
  }, [isPending, session, router]);

  // Show loading while checking auth
  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    );
  }

  // Don't render anything while redirecting
  if (!session?.user) {
    return null;
  }

  return (
    <div className="flex h-screen">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar isAdmin={isAdmin} />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-16 items-center border-b px-4 lg:hidden">
          <MobileNav isAdmin={isAdmin} />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
