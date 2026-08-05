import { createAuthClient } from "better-auth/react";
import { adminClient, genericOAuthClient } from "better-auth/client/plugins";
import { apiKeyClient } from "@better-auth/api-key/client";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [adminClient(), apiKeyClient(), genericOAuthClient()],
});

export type Session = typeof authClient.$Infer.Session;

export const { useSession, signIn, signOut, signUp } = authClient;
