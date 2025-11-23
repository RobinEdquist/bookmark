"use client";

import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { authClient } from "../../lib/auth-client";

export default function LibrariesPage() {
  const { data: session } = authClient.useSession();

  const handleSignOut = async () => {
    await authClient.signOut();
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Your Libraries</CardTitle>
            <CardDescription>
              Welcome back, {session?.user?.name || session?.user?.email}!
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-muted-foreground">
              Your audiobook libraries will appear here.
            </p>
            <Button variant="outline" onClick={handleSignOut}>
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
