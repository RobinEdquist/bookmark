"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "../components/auth/auth-card";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { authClient } from "../lib/auth-client";
import { usePublicSettings } from "../lib/use-public-settings";

export default function Home() {
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const { settings, isLoading: settingsLoading } = usePublicSettings();

  useEffect(() => {
    if (session?.user) {
      router.push("/libraries");
    }
  }, [session, router]);

  const isLoading = sessionLoading || settingsLoading;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Already authenticated, will redirect
  if (session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute left-1/3 top-1/3 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-2xl" />
      </div>

      {/* Auth card */}
      <div className="relative z-10">
        <AuthCard signupsEnabled={settings?.signupsEnabled ?? false} />
      </div>
    </div>
  );
}
