"use client";

import Link from "next/link";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { authClient } from "../../lib/auth-client";

export default function LibrariesPage() {
  const { data: session } = authClient.useSession();
  const user = session?.user as { role?: string } | undefined;
  const isAdmin = user?.role === "admin";

  const handleSignOut = async () => {
    await authClient.signOut();
    window.location.href = "/";
  };

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Your Libraries</h1>
            <p className="text-muted-foreground">
              Welcome back, {session?.user?.name || session?.user?.email}!
            </p>
          </div>
          <nav className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="outline" asChild>
                <Link href="/settings">Settings</Link>
              </Button>
            )}
            <Button variant="outline" onClick={handleSignOut}>
              Sign Out
            </Button>
          </nav>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Libraries</CardTitle>
            <CardDescription>
              Manage your audiobook collections
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Your audiobook libraries will appear here.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
