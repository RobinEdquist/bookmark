"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Library, Settings, LogOut } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import { Button } from "@repo/ui/components/ui/button";
import { authClient } from "../../lib/auth-client";

interface SidebarProps {
  isAdmin: boolean;
  onNavigate?: () => void;
}

const navItems = [
  { href: "/libraries", icon: Library, labelKey: "library" },
] as const;

export function Sidebar({ isAdmin, onNavigate }: SidebarProps) {
  const t = useTranslations("common");
  const pathname = usePathname();

  const handleSignOut = async () => {
    await authClient.signOut();
    window.location.href = "/";
  };

  const handleNavClick = () => {
    onNavigate?.();
  };

  return (
    <aside className="flex h-full w-60 flex-col border-r bg-muted/30">
      {/* Header */}
      <div className="flex h-16 items-center border-b px-6">
        <Link
          href="/libraries"
          className="text-lg font-semibold tracking-tight"
          onClick={handleNavClick}
        >
          {t("appName")}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
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

      {/* Bottom actions */}
      <div className="border-t p-4 space-y-1">
        {isAdmin && (
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
        )}
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 px-3 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="h-5 w-5" />
          {t("nav.signOut")}
        </Button>
      </div>
    </aside>
  );
}
