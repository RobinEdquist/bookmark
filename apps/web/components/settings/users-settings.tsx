"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { useUsers, useUnbanUser, type User } from "../../lib/use-users";
import { authClient } from "../../lib/auth-client";
import { UserTable } from "./user-table";
import { CreateUserDialog } from "./create-user-dialog";
import { EditUserDialog } from "./edit-user-dialog";
import { BanUserDialog } from "./ban-user-dialog";
import { DeleteUserDialog } from "./delete-user-dialog";
import { AuthenticationSettings } from "./authentication-settings";

export function UsersSettings() {
  const t = useTranslations("settings.users");
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const { data: session } = authClient.useSession();
  const { data, isLoading, error } = useUsers(search || undefined);
  const unbanUser = useUnbanUser();

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setEditDialogOpen(true);
  };

  const handleBan = (user: User) => {
    setSelectedUser(user);
    setBanDialogOpen(true);
  };

  const handleUnban = async (user: User) => {
    try {
      await unbanUser.mutateAsync(user.id);
      toast.success(t("toast.unbanSuccess"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toast.unbanError"));
    }
  };

  const handleDelete = (user: User) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <LoadingSpinner size="lg" className="text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-6">
          <p className="text-destructive">Failed to load users</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <AuthenticationSettings />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("title")}</CardTitle>
              <CardDescription>{t("description")}</CardDescription>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              {t("createUser")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <UserTable
            users={data?.users ?? []}
            onEdit={handleEdit}
            onBan={handleBan}
            onUnban={handleUnban}
            onDelete={handleDelete}
            currentUserId={session?.user?.id ?? ""}
          />
        </CardContent>
      </Card>

      <CreateUserDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      <EditUserDialog
        user={selectedUser}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />

      <BanUserDialog
        user={selectedUser}
        open={banDialogOpen}
        onOpenChange={setBanDialogOpen}
      />

      <DeleteUserDialog
        user={selectedUser}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </div>
  );
}
