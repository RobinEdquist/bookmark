"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { Sidebar } from "../../components/layout/sidebar";
import { MobileNav } from "../../components/layout/mobile-nav";
import { PlayerBar } from "../../components/player/player-bar";
import { WebSocketProvider } from "../../components/providers/websocket-provider";
import { authClient } from "../../lib/auth-client";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending, error } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";
  const isAuthenticated = !isPending && !!session?.user;

  // Log auth state changes
  useEffect(() => {
    console.log("[AuthenticatedLayout]", {
      pathname,
      isPending,
      hasSession: !!session,
      hasUser: !!session?.user,
      userId: session?.user?.id,
      userRole: session?.user?.role,
      isAdmin,
      isAuthenticated,
      error: error?.message ?? null,
    });
  }, [pathname, isPending, session, isAdmin, isAuthenticated, error]);

  useEffect(() => {
    if (!isPending && !session?.user) {
      console.log("[AuthenticatedLayout] Redirecting to / - no session", {
        pathname,
        isPending,
        session,
      });
      router.push("/");
    }
  }, [isPending, session, router, pathname]);

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
    <WebSocketProvider enabled={isAuthenticated}>
      <div className="flex h-screen flex-col">
        <div className="flex flex-1 overflow-hidden">
          {/* Desktop sidebar */}
          <div className="hidden lg:block">
            <Sidebar isAdmin={isAdmin} />
          </div>

          {/* Main content */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Mobile header - hidden on library pages that have their own header */}
            {!pathname.startsWith("/audiobooks") && !pathname.startsWith("/ebooks") && (
              <header className="flex h-16 items-center border-b px-4 lg:hidden">
                <MobileNav isAdmin={isAdmin} />
              </header>
            )}

            {/* Page content */}
            <main className="flex-1 overflow-auto">{children}</main>
          </div>
        </div>

        {/* Audio player bar - in document flow, not fixed */}
        <PlayerBar />
      </div>
    </WebSocketProvider>
  );
}
