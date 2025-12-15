"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { LoginForm } from "./login-form";
import { SignupForm } from "./signup-form";
import { OidcButton } from "./oidc-button";
import { useAuthConfig } from "../../lib/use-auth-config";

interface AuthCardProps {
  signupsEnabled: boolean;
}

export function AuthCard({ signupsEnabled }: AuthCardProps) {
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const { data: authConfig, isLoading: isLoadingConfig } = useAuthConfig();

  // Show loading state while fetching auth config
  if (isLoadingConfig) {
    return (
      <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur-sm ">
        <CardContent className="flex items-center justify-center p-12">
          <LoadingSpinner size="lg" className="text-primary" />
        </CardContent>
      </Card>
    );
  }

  const showEmailPassword = authConfig?.emailPasswordEnabled ?? true;
  const showOidc = authConfig?.oidcEnabled ?? false;
  const oidcButtonText = authConfig?.oidcButtonText ?? "Sign in with SSO";

  // If neither method is available, show error
  if (!showEmailPassword && !showOidc) {
    return (
      <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold tracking-tight">
            {tCommon("appName")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">
            {t("error.noAuthMethods")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur-sm w-full">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl font-bold tracking-tight">
          {tCommon("appName")}
        </CardTitle>
        <CardDescription>
          {activeTab === "login"
            ? t("login.description")
            : t("signup.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* OIDC Button */}
        {showOidc && (
          <>
            <OidcButton buttonText={oidcButtonText} />
            {showEmailPassword && (
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    {t("divider.or")}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Email/Password Forms */}
        {showEmailPassword && (
          <>
            {signupsEnabled && (
              <nav className="mb-6 flex rounded-lg bg-muted p-1" role="tablist">
                <Button
                  variant={activeTab === "login" ? "default" : "ghost"}
                  className="flex-1"
                  onClick={() => setActiveTab("login")}
                  role="tab"
                  aria-selected={activeTab === "login"}
                >
                  {t("tabs.signIn")}
                </Button>
                <Button
                  variant={activeTab === "signup" ? "default" : "ghost"}
                  className="flex-1"
                  onClick={() => setActiveTab("signup")}
                  role="tab"
                  aria-selected={activeTab === "signup"}
                >
                  {t("tabs.signUp")}
                </Button>
              </nav>
            )}

            {activeTab === "login" || !signupsEnabled ? (
              <LoginForm />
            ) : (
              <SignupForm />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
