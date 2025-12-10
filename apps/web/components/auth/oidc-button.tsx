"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { authClient } from "../../lib/auth-client";

interface OidcButtonProps {
  buttonText: string;
}

export function OidcButton({ buttonText }: OidcButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleOidcSignIn = async () => {
    setIsLoading(true);
    try {
      await authClient.signIn.oauth2({
        providerId: "oidc",
        callbackURL: "/libraries",
      });
    } catch (error) {
      toast.error("Failed to initiate SSO sign-in");
      setIsLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
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
        buttonText
      )}
    </Button>
  );
}
