"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home, Headphones, BookOpen, TabletSmartphone, Settings, User, LogOut, Search, ClipboardList, ListMusic, Library } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import { Button } from "@repo/ui/components/ui/button";
import { authClient } from "../../lib/auth-client";
import { useLibraryAvailability } from "../../lib/use-library-availability";
import { useSettings } from "../../lib/use-settings";
import { useMyPermissions } from "../../lib/use-users";
import { TasksIndicator } from "./tasks-indicator";
import { AppLogo } from "./app-logo";

interface SidebarProps {
  isAdmin: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ isAdmin, onNavigate }: SidebarProps) {
  const t = useTranslations("common");
  const pathname = usePathname();
  const { data: availability } = useLibraryAvailability();
  const { settings } = useSettings();
  const { data: permissions } = useMyPermissions();

  // Show requests if enabled and user has permission (admins always have permission)
  const canRequestContent = permissions?.canRequestContent ?? false;
  const showRequests = settings?.requestsEnabled && (isAdmin || canRequestContent);

  const handleSignOut = async () => {
    await authClient.signOut();
    window.location.href = "/";
  };

  const handleNavClick = () => {
    onNavigate?.();
  };

  // Build nav items based on library availability
  const navItems = [
    { href: "/home", icon: Home, labelKey: "home", show: true },
    { href: "/audiobooks", icon: Headphones, labelKey: "audiobooks", show: availability?.audiobooks ?? false },
    { href: "/ebooks", icon: BookOpen, labelKey: "ebooks", show: availability?.ebooks ?? false },
    { href: "/series", icon: Library, labelKey: "series", show: true },
    { href: "/lists", icon: ListMusic, labelKey: "lists", show: true },
    { href: "/e-reader", icon: TabletSmartphone, labelKey: "eReader", show: availability?.opds ?? false },
    { href: "/requests", icon: Search, labelKey: "requests", show: showRequests },
  ];

  return (
    <aside className="flex h-full w-60 flex-col border-r bg-muted/30">
      {/* Header */}
      <div className="flex h-16 items-center border-b px-4">
        <AppLogo onClick={handleNavClick} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navItems
          .filter((item) => item.show)
          .map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavClick}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {t(`nav.${item.labelKey}`)}
              </Link>
            );
          })}
      </nav>

      {/* Tasks indicator */}
      <TasksIndicator />

      {/* Bottom actions */}
      <div className="border-t p-4 space-y-1">
        {isAdmin && (
          <>
            <Link
              href="/settings"
              onClick={handleNavClick}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                pathname === "/settings" || pathname.startsWith("/settings/")
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Settings className="h-5 w-5" />
              {t("nav.settings")}
            </Link>
            {showRequests && (
              <Link
                href="/admin/requests"
                onClick={handleNavClick}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  pathname === "/admin/requests" || pathname.startsWith("/admin/requests/")
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <ClipboardList className="h-5 w-5" />
                {t("nav.manageRequests")}
              </Link>
            )}
          </>
        )}
        <Link
          href="/preferences"
          onClick={handleNavClick}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            pathname === "/preferences" || pathname.startsWith("/preferences/")
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <User className="h-5 w-5" />
          {t("nav.preferences")}
        </Link>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 px-3 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="h-5 w-5" />
          {t("nav.signOut")}
        </Button>
        <div className="mt-3 flex items-center gap-2 px-3">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-muted-foreground/20 to-transparent" />
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">pre-alpha</span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-muted-foreground/20 to-transparent" />
        </div>
      </div>
    </aside>
  );
}
