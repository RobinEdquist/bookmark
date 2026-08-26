import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { apiKeyClient } from "@better-auth/api-key/client";

// better-auth 1.7 dropped genericOAuthClient: generic OAuth providers are
// first-class social providers now, signed in via signIn.social({ provider }).
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [adminClient(), apiKeyClient()],
});

export type Session = typeof authClient.$Infer.Session;

export const { useSession, signIn, signOut, signUp } = authClient;
