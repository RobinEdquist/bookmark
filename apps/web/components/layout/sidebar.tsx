"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home, Headphones, BookOpen, BookImage, TabletSmartphone, Smartphone, Settings, User, LogOut, Search, ClipboardList, ListMusic, Library, LayoutGrid, BarChart3, Trophy, type LucideIcon } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import { authClient } from "../../lib/auth-client";
import { useLibraryAvailability } from "../../lib/use-library-availability";
import { useSettings } from "../../lib/use-settings";
import { useMyPermissions } from "../../lib/use-users";
import { TasksIndicator } from "./tasks-indicator";
import { AppLogo } from "./app-logo";

interface SidebarProps {
  isAdmin: boolean;
  onNavigate?: () => void;
  /** Render as a floating, rounded, inset panel (desktop). Mobile drawer stays edge-to-edge. */
  floating?: boolean;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-3 pb-1 pt-5 text-[11px] font-semibold tracking-wide text-muted-foreground/70 first:pt-1">
      {children}
    </h3>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  onClick,
  scroll,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick?: () => void;
  /** Pass false for pages that manage their own scroll via useScrollRestoration. */
  scroll?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      scroll={scroll}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-1.5 text-[13px] transition-colors",
        active
          ? "bg-foreground/[0.06] font-semibold text-foreground"
          : "font-medium text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0 text-primary" strokeWidth={2} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function Sidebar({ isAdmin, onNavigate, floating = false }: SidebarProps) {
  const t = useTranslations("common");
  const pathname = usePathname();
  const { data: availability } = useLibraryAvailability();
  const { settings } = useSettings();
  const { data: permissions } = useMyPermissions();

  // Show requests if enabled and user has permission (admins always have permission)
  const canRequestContent = permissions?.canRequestContent ?? false;
  const showRequests = settings?.requestsEnabled && (isAdmin || canRequestContent);
  const hasAnyLibrary =
    (availability?.audiobooks ?? false) ||
    (availability?.ebooks ?? false) ||
    (availability?.comics ?? false);

  const handleSignOut = async () => {
    await authClient.signOut();
    window.location.href = "/";
  };

  const handleNavClick = () => {
    onNavigate?.();
  };

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  // Grouped navigation, Apple Music style: quiet section headers + dense rows
  const groups: {
    title?: string;
    items: { href: string; icon: LucideIcon; labelKey: string; show: boolean; active?: boolean; scroll?: boolean }[];
  }[] = [
    {
      items: [{ href: "/home", icon: Home, labelKey: "home", show: true }],
    },
    {
      title: t("nav.sections.library"),
      items: [
        // scroll: false on library pages — they restore their own scroll position
        { href: "/audiobooks", icon: Headphones, labelKey: "audiobooks", show: availability?.audiobooks ?? false, scroll: false },
        { href: "/ebooks", icon: BookOpen, labelKey: "ebooks", show: availability?.ebooks ?? false, scroll: false },
        { href: "/comics", icon: BookImage, labelKey: "comics", show: availability?.comics ?? false, scroll: false },
        { href: "/series", icon: Library, labelKey: "series", show: true, scroll: false },
        { href: "/genres", icon: LayoutGrid, labelKey: "genres", show: hasAnyLibrary },
      ],
    },
    {
      title: t("nav.sections.discover"),
      items: [
        { href: "/lists", icon: ListMusic, labelKey: "lists", show: true },
        { href: "/top-list", icon: Trophy, labelKey: "topList", show: true },
        { href: "/requests", icon: Search, labelKey: "requests", show: showRequests ?? false },
      ],
    },
    {
      title: t("nav.sections.devices"),
      items: [
        { href: "/audiobook-app", icon: Smartphone, labelKey: "audiobookApp", show: permissions?.canGenerateApiKeys ?? false },
        { href: "/e-reader", icon: TabletSmartphone, labelKey: "eReader", show: availability?.opds ?? false },
      ],
    },
  ];

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-muted/40 backdrop-blur-xl",
        floating
          ? "w-60 overflow-hidden rounded-2xl border border-border/50 shadow-xl shadow-black/20"
          : "w-screen border-r border-border/50",
      )}
    >
      {/* Header */}
      <div className="flex h-16 items-center px-4">
        <AppLogo onClick={handleNavClick} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {groups.map((group, gi) => {
          const visible = group.items.filter((item) => item.show);
          if (visible.length === 0) return null;
          return (
            <div key={gi} className="space-y-0.5">
              {group.title && <SectionLabel>{group.title}</SectionLabel>}
              {visible.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={t(`nav.${item.labelKey}`)}
                  active={isActive(item.href)}
                  onClick={handleNavClick}
                  scroll={item.scroll}
                />
              ))}
            </div>
          );
        })}
      </nav>

      {/* Tasks indicator */}
      <TasksIndicator />

      {/* Bottom actions */}
      <div className="border-t border-border/50 px-2 py-3">
        <div className="space-y-0.5">
          <SectionLabel>{t("nav.sections.account")}</SectionLabel>
          {isAdmin && (
            <NavLink
              href="/settings"
              icon={Settings}
              label={t("nav.settings")}
              active={isActive("/settings")}
              onClick={handleNavClick}
            />
          )}
          {isAdmin && showRequests && (
            <NavLink
              href="/admin/requests"
              icon={ClipboardList}
              label={t("nav.manageRequests")}
              active={isActive("/admin/requests")}
              onClick={handleNavClick}
            />
          )}
          <NavLink
            href="/users/me"
            icon={BarChart3}
            label={t("nav.myStats")}
            active={pathname.startsWith("/users/")}
            onClick={handleNavClick}
          />
          <NavLink
            href="/preferences"
            icon={User}
            label={t("nav.preferences")}
            active={isActive("/preferences")}
            onClick={handleNavClick}
          />
          <button
            type="button"
            onClick={handleSignOut}
            className="group flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0 text-primary" strokeWidth={2} />
            <span className="truncate">{t("nav.signOut")}</span>
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 px-3">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-muted-foreground/20 to-transparent" />
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">pre-alpha</span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-muted-foreground/20 to-transparent" />
        </div>
      </div>
    </aside>
  );
}
