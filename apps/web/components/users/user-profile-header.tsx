"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";

import type { UserProfile } from "../../lib/use-user-profile";

interface UserProfileHeaderProps {
  user: UserProfile;
}

export function UserProfileHeader({ user }: UserProfileHeaderProps) {
  const router = useRouter();
  const t = useTranslations("userProfile");

  const initial = user.name?.charAt(0)?.toUpperCase() ?? "?";
  const isAdmin = user.role === "admin";
  const memberSince = new Date(user.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-4">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="gap-1"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </Button>

      {/* Profile info */}
      <div className="flex items-center gap-4">
        {/* Avatar */}
        {user.image ? (
          <Image
            src={user.image}
            alt={user.name}
            width={64}
            height={64}
            className="h-16 w-16 rounded-full object-cover"
            unoptimized={user.image.startsWith("/api/")}
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-semibold text-primary">
            {initial}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{user.name}</h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                isAdmin
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isAdmin ? t("role.admin") : t("role.user")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <p className="text-xs text-muted-foreground">
            {t("memberSince", { date: memberSince })}
          </p>
        </div>
      </div>
    </div>
  );
}
