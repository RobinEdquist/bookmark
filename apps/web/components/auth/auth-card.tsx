"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import { LoginForm } from "./login-form";
import { SignupForm } from "./signup-form";

interface AuthCardProps {
  signupsEnabled: boolean;
}

export function AuthCard({ signupsEnabled }: AuthCardProps) {
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");

  return (
    <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-3xl font-bold tracking-tight">
          Simple Audiobook Vault
        </CardTitle>
        <CardDescription>
          {activeTab === "login"
            ? "Welcome back! Sign in to access your library."
            : "Create an account to get started."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {signupsEnabled && (
          <div className="mb-6 flex rounded-lg bg-muted p-1">
            <Button
              variant={activeTab === "login" ? "default" : "ghost"}
              className="flex-1"
              onClick={() => setActiveTab("login")}
            >
              Sign In
            </Button>
            <Button
              variant={activeTab === "signup" ? "default" : "ghost"}
              className="flex-1"
              onClick={() => setActiveTab("signup")}
            >
              Sign Up
            </Button>
          </div>
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
