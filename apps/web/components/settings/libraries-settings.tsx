"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

export function LibrariesSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Libraries</CardTitle>
        <CardDescription>Manage your audiobook libraries</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Library management features coming soon.
        </p>
      </CardContent>
    </Card>
  );
}
