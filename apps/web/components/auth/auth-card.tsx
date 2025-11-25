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
import { LoginForm } from "./login-form";
import { SignupForm } from "./signup-form";

interface AuthCardProps {
  signupsEnabled: boolean;
}

export function AuthCard({ signupsEnabled }: AuthCardProps) {
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");

  return (
    <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur-sm">
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
      </CardContent>
    </Card>
  );
}
