"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { authClient } from "../../lib/auth-client";

interface OidcButtonProps {
  buttonText: string;
  /**
   * When OIDC is the only available auth method we give the button primary
   * emphasis; otherwise it sits next to the email/password form as a secondary
   * option.
   */
  emphasis?: "primary" | "secondary";
}

export function OidcButton({
  buttonText,
  emphasis = "secondary",
}: OidcButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleOidcSignIn = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await authClient.signIn.oauth2({
        providerId: "oidc",
        callbackURL: "/home",
        errorCallbackURL: "/?error=sso",
      });

      if (error) {
        toast.error(error.message || "Failed to initiate SSO sign-in");
        setIsLoading(false);
        return;
      }

      // Redirect explicitly. Relying on better-auth's implicit redirect
      // handler can require a second click in some environments, so we
      // navigate ourselves as soon as we have the authorization URL.
      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      toast.error("Failed to initiate SSO sign-in");
      setIsLoading(false);
    } catch {
      toast.error("Failed to initiate SSO sign-in");
      setIsLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant={emphasis === "primary" ? "default" : "outline"}
      size="lg"
      className="w-full"
      onClick={handleOidcSignIn}
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <LoadingSpinner size="sm" />
          Redirecting...
        </>
      ) : (
        <>
          <ShieldCheck className="size-4" />
          {buttonText}
        </>
      )}
    </Button>
  );
}
