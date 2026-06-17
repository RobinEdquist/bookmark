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
import { AuthBrand } from "./auth-brand";
import { LoginForm } from "./login-form";
import { SignupForm } from "./signup-form";
import { OidcButton } from "./oidc-button";
import { useAuthConfig } from "../../lib/use-auth-config";

interface AuthCardProps {
  signupsEnabled: boolean;
}

const cardClassName =
  "w-full max-w-md overflow-hidden rounded-2xl border-border/60 bg-card/70 shadow-2xl shadow-black/20 backdrop-blur-xl";

export function AuthCard({ signupsEnabled }: AuthCardProps) {
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  const t = useTranslations("auth");
  const { data: authConfig, isLoading: isLoadingConfig } = useAuthConfig();

  // Show loading state while fetching auth config
  if (isLoadingConfig) {
    return (
      <div className="flex w-full max-w-md flex-col items-center">
        <AuthBrand />
        <Card className={cardClassName}>
          <CardContent className="flex items-center justify-center p-12">
            <LoadingSpinner size="lg" className="text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const showEmailPassword = authConfig?.emailPasswordEnabled ?? true;
  const showOidc = authConfig?.oidcEnabled ?? false;
  const oidcButtonText = authConfig?.oidcButtonText ?? "Sign in with SSO";

  // If neither method is available, show error
  if (!showEmailPassword && !showOidc) {
    return (
      <div className="flex w-full max-w-md flex-col items-center">
        <AuthBrand />
        <Card className={cardClassName}>
          <CardContent className="p-8">
            <p className="text-center text-muted-foreground">
              {t("error.noAuthMethods")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const showTabs = showEmailPassword && signupsEnabled;
  const isSignup = showTabs && activeTab === "signup";
  const title = isSignup ? t("signup.title") : t("login.title");
  const description = isSignup
    ? t("signup.description")
    : t("login.description");

  return (
    <div className="flex w-full max-w-md flex-col items-center">
      <AuthBrand />
      <Card className={cardClassName}>
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* OIDC Button */}
          {showOidc && (
            <>
              <OidcButton
                buttonText={oidcButtonText}
                emphasis={showEmailPassword ? "secondary" : "primary"}
              />
              {showEmailPassword && (
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/60" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase tracking-wider">
                    <span className="bg-card px-3 text-muted-foreground">
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
              {showTabs && (
                <nav
                  className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1"
                  role="tablist"
                >
                  <Button
                    variant={activeTab === "login" ? "default" : "ghost"}
                    className="rounded-lg"
                    onClick={() => setActiveTab("login")}
                    role="tab"
                    aria-selected={activeTab === "login"}
                  >
                    {t("tabs.signIn")}
                  </Button>
                  <Button
                    variant={activeTab === "signup" ? "default" : "ghost"}
                    className="rounded-lg"
                    onClick={() => setActiveTab("signup")}
                    role="tab"
                    aria-selected={activeTab === "signup"}
                  >
                    {t("tabs.signUp")}
                  </Button>
                </nav>
              )}

              {activeTab === "login" || !showTabs ? <LoginForm /> : <SignupForm />}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
