"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AuthCard } from "../components/auth/auth-card";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { authClient } from "../lib/auth-client";
import { usePublicSettings } from "../lib/use-public-settings";

function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen w-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Ambient background glow */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute -top-32 left-1/2 h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-primary/20 blur-[140px]" />
        <div className="absolute bottom-[-10rem] left-[10%] h-[420px] w-[420px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute right-[5%] top-1/3 h-[360px] w-[360px] rounded-full bg-primary/10 blur-[120px]" />
        {/* Subtle grid texture */}
        <div className="absolute inset-0 bg-[radial-gradient(hsl(var(--foreground)/0.04)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex w-full justify-center">{children}</div>
    </main>
  );
}

export default function Home() {
  const router = useRouter();
  const t = useTranslations("auth");
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const { settings, isLoading: settingsLoading } = usePublicSettings();

  useEffect(() => {
    if (session?.user) {
      router.push("/home");
    }
  }, [session, router]);

  // Surface SSO failures redirected back via the OIDC errorCallbackURL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "sso") {
      toast.error(t("error.ssoFailed"));
      router.replace("/");
    }
  }, [router, t]);

  const isLoading = sessionLoading || settingsLoading;

  if (isLoading || session?.user) {
    return (
      <PageLayout>
        <LoadingSpinner size="lg" className="text-primary" />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <AuthCard signupsEnabled={settings?.signupsEnabled ?? false} />
    </PageLayout>
  );
}
