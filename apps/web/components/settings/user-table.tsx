"use client";

import Image from "next/image";
import { Button } from "@repo/ui/components/ui/button";
import type { User } from "../../lib/use-users";
import { useTranslations } from "next-intl";

interface UserTableProps {
  users: User[];
  onEdit: (user: User) => void;
  onBan: (user: User) => void;
  onUnban: (user: User) => void;
  onDelete: (user: User) => void;
  currentUserId: string;
}

export function UserTable({
  users,
  onEdit,
  onBan,
  onUnban,
  onDelete,
  currentUserId,
}: UserTableProps) {
  const t = useTranslations("settings.users");

  if (users.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">{t("noUsers")}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="px-4 py-3 text-left font-medium">{t("table.name")}</th>
            <th className="px-4 py-3 text-left font-medium">{t("table.email")}</th>
            <th className="px-4 py-3 text-left font-medium">{t("table.role")}</th>
            <th className="px-4 py-3 text-left font-medium">{t("table.status")}</th>
            <th className="px-4 py-3 text-left font-medium">{t("table.created")}</th>
            <th className="px-4 py-3 text-left font-medium">{t("table.apiKey")}</th>
            <th className="px-4 py-3 text-right font-medium">{t("table.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b hover:bg-muted/50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {user.image && (
                    <Image
                      src={user.image}
                      alt=""
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full"
                    />
                  )}
                  <span className="font-medium">{user.name}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                    user.role === "admin"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {user.role === "admin" ? t("role.admin") : t("role.user")}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                    user.banned
                      ? "bg-destructive/10 text-destructive"
                      : "bg-green-500/10 text-green-600"
                  }`}
                >
                  {user.banned ? t("status.banned") : t("status.active")}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {new Date(user.createdAt).toDateString()}
              </td>
              <td className="px-4 py-3">
                {user.apiKey?.hasKey ? (
                  <div className="flex flex-col">
                    <span className="inline-flex w-fit rounded-full bg-green-500/10 px-2 py-1 text-xs font-medium text-green-600">
                      {t("apiKey.active")}
                    </span>
                    {user.apiKey.lastUsed && (
                      <span className="mt-1 text-xs text-muted-foreground">
                        {t("apiKey.lastUsed")}: {new Date(user.apiKey.lastUsed).toDateString()}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                    {t("apiKey.none")}
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(user)}
                  >
                    {t("actions.edit")}
                  </Button>
                  {user.id !== currentUserId && (
                    <>
                      {user.banned ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onUnban(user)}
                        >
                          {t("actions.unban")}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onBan(user)}
                        >
                          {t("actions.ban")}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => onDelete(user)}
                      >
                        {t("actions.delete")}
                      </Button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
