"use client";

import { useLayoutEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Home,
  Headphones,
  BookOpen,
  BookImage,
  TabletSmartphone,
  Smartphone,
  Settings,
  User,
  LogOut,
  Search,
  ClipboardList,
  ListChecks,
  ListMusic,
  Library,
  LayoutGrid,
  BarChart3,
  Trophy,
  ChevronsUpDown,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { cn } from "@repo/ui/lib/utils";
import { authClient } from "../../lib/auth-client";
import { useLibraryAvailability } from "../../lib/use-library-availability";
import { useUserSettings } from "../../lib/use-settings";
import { useMyPermissions } from "../../lib/use-users";
import { TasksIndicator } from "./tasks-indicator";
import { AppLogo } from "./app-logo";
import { VersionBadge } from "./version-badge";

interface SidebarProps {
  isAdmin: boolean;
  onNavigate?: () => void;
  /** Render as a floating, rounded, inset panel (desktop). Mobile drawer stays edge-to-edge. */
  floating?: boolean;
}

// The active row is marked by a glowing "neon tube" in the left gutter. It
// travels like the Android NeonNavigationBar worm: the edge heading toward the
// new row moves first and the trailing edge catches up a beat later.
const TUBE_LEAD = "380ms cubic-bezier(0.4, 0, 0.2, 1)";
const TUBE_FOLLOW = "320ms cubic-bezier(0.4, 0, 0.2, 1) 90ms";
/** Trimmed from the active row's top and bottom so the tube sits inside it. */
const TUBE_INSET = 8;
const TUBE_GLOW =
  "0 0 4px hsl(var(--primary) / 0.9), 0 0 12px hsl(var(--primary) / 0.5)";
const ICON_GLOW = "drop-shadow(0 0 5px hsl(var(--primary) / 0.65))";

/**
 * Positions the tube over the row marked `aria-current="page"` inside the
 * list. Styles are written straight to the element so a route change animates
 * with a CSS transition instead of a re-render. Layout changes that are not a
 * route change (rows appearing once permissions load) snap it into place.
 */
function useNeonTube(activeKey: string) {
  const listRef = useRef<HTMLDivElement>(null);
  const tubeRef = useRef<HTMLSpanElement>(null);
  const placed = useRef<{ key: string; top: number; bottom: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const list = listRef.current;
    const tube = tubeRef.current;
    if (!list || !tube) return;

    const place = (routeChanged: boolean) => {
      const row = list.querySelector<HTMLElement>('[aria-current="page"]');
      if (!row) {
        tube.style.opacity = "0";
        placed.current = null;
        return;
      }
      const top = row.offsetTop + TUBE_INSET;
      const bottom =
        list.offsetHeight - row.offsetTop - row.offsetHeight + TUBE_INSET;
      const prev = placed.current;
      // Re-applying the same position would cancel a transition in flight.
      if (prev && prev.top === top && prev.bottom === bottom) return;

      const reduceMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
        false;
      if (routeChanged && prev && !reduceMotion) {
        tube.style.transition =
          top > prev.top
            ? `bottom ${TUBE_LEAD}, top ${TUBE_FOLLOW}`
            : `top ${TUBE_LEAD}, bottom ${TUBE_FOLLOW}`;
      } else {
        tube.style.transition = "none";
      }
      tube.style.top = `${top}px`;
      tube.style.bottom = `${bottom}px`;
      tube.style.opacity = "1";
      placed.current = { key: activeKey, top, bottom };
    };

    place(placed.current !== null && placed.current.key !== activeKey);

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => place(false));
    observer.observe(list);
    return () => observer.disconnect();
  }, [activeKey]);

  return { listRef, tubeRef };
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2.5 px-2.5 pb-1.5 pt-5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      <span>{children}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-border/70" />
    </h3>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  touch,
  onClick,
  scroll,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  /** Taller rows for the touch drawer. */
  touch: boolean;
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
        "group flex items-center gap-3 rounded-lg px-2.5 transition-colors",
        touch ? "h-11 text-[15px]" : "h-8 text-[13.5px]",
        active
          ? "font-semibold text-foreground"
          : "font-medium text-muted-foreground hover:bg-foreground/[0.045] hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "shrink-0 transition-[color,filter] duration-200",
          touch ? "h-5 w-5" : "h-[18px] w-[18px]",
          active
            ? "text-primary"
            : "text-muted-foreground/80 group-hover:text-foreground",
        )}
        style={active ? { filter: ICON_GLOW } : undefined}
        strokeWidth={1.75}
      />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function AccountAvatar({
  name,
  image,
}: {
  name: string;
  image?: string | null;
}) {
  // Only server-hosted avatars: next/image has no remote hosts configured, so
  // an identity provider's absolute URL would throw on every page.
  if (image?.startsWith("/")) {
    return (
      <Image
        src={image}
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 shrink-0 rounded-full object-cover"
        unoptimized
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[13px] font-semibold text-primary"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function AccountMenu({
  active,
  touch,
  onNavigate,
  onSignOut,
}: {
  /** The current page is one of the menu's own pages. */
  active: boolean;
  touch: boolean;
  onNavigate: () => void;
  onSignOut: () => void;
}) {
  const t = useTranslations("common");
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const name = user?.name || user?.email || t("nav.sections.account");
  const itemClassName = cn(
    "gap-3 rounded-lg px-2.5 [&>svg]:text-muted-foreground",
    touch ? "h-11 text-[15px]" : "h-8 text-[13px]",
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl p-2 text-left outline-none transition-colors hover:bg-foreground/[0.045] focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-foreground/[0.06]",
            active && "bg-foreground/[0.06]",
          )}
        >
          <AccountAvatar name={name} image={user?.image} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-foreground">
              {name}
            </span>
            {user?.name && user.email && (
              <span className="block truncate text-[11.5px] text-muted-foreground">
                {user.email}
              </span>
            )}
          </span>
          <ChevronsUpDown
            className="h-4 w-4 shrink-0 text-muted-foreground"
            strokeWidth={1.75}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="z-[60] w-[var(--radix-dropdown-menu-trigger-width)] rounded-xl p-1.5"
      >
        <DropdownMenuItem asChild className={itemClassName}>
          <Link href="/users/me" onClick={onNavigate}>
            <BarChart3 strokeWidth={1.75} />
            {t("nav.myStats")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={itemClassName}>
          <Link href="/preferences" onClick={onNavigate}>
            <User strokeWidth={1.75} />
            {t("nav.preferences")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className={itemClassName} onSelect={onSignOut}>
          <LogOut strokeWidth={1.75} />
          {t("nav.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Sidebar({
  isAdmin,
  onNavigate,
  floating = false,
}: SidebarProps) {
  const t = useTranslations("common");
  const pathname = usePathname();
  const { data: availability } = useLibraryAvailability();
  // Reduced settings subset — the full settings payload is admin-only.
  const { settings } = useUserSettings();
  const { data: permissions } = useMyPermissions();
  const { listRef, tubeRef } = useNeonTube(pathname);
  // The drawer is the phone and tablet layout, so it gets touch-sized rows.
  const touch = !floating;

  // Show requests if enabled and user has permission (admins always have permission)
  const canRequestContent = permissions?.canRequestContent ?? false;
  const showRequests =
    settings?.requestsEnabled && (isAdmin || canRequestContent);
  // Mirrors the backend guard: metadata editing is a permission of its own, so
  // non-admins who hold it get the worklist too. No `isAdmin ||` needed —
  // `/users/me/permissions` already reports every permission as true for
  // admins. The worklist covers audiobooks and ebooks only, so a comics-only
  // instance would otherwise get a link to a page reporting 0 of 0 on both tabs.
  const showMetadataGaps =
    (permissions?.canEditMetadata ?? false) &&
    ((availability?.audiobooks ?? false) || (availability?.ebooks ?? false));
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
    items: {
      href: string;
      icon: LucideIcon;
      labelKey: string;
      show: boolean;
      active?: boolean;
      scroll?: boolean;
    }[];
  }[] = [
    {
      items: [{ href: "/home", icon: Home, labelKey: "home", show: true }],
    },
    {
      title: t("nav.sections.library"),
      items: [
        // scroll: false on library pages — they restore their own scroll position
        {
          href: "/audiobooks",
          icon: Headphones,
          labelKey: "audiobooks",
          show: availability?.audiobooks ?? false,
          scroll: false,
        },
        {
          href: "/ebooks",
          icon: BookOpen,
          labelKey: "ebooks",
          show: availability?.ebooks ?? false,
          scroll: false,
        },
        {
          href: "/comics",
          icon: BookImage,
          labelKey: "comics",
          show: availability?.comics ?? false,
          scroll: false,
        },
        {
          href: "/series",
          icon: Library,
          labelKey: "series",
          show: true,
          scroll: false,
        },
        {
          href: "/genres",
          icon: LayoutGrid,
          labelKey: "genres",
          show: hasAnyLibrary,
        },
      ],
    },
    {
      title: t("nav.sections.discover"),
      items: [
        { href: "/lists", icon: ListMusic, labelKey: "lists", show: true },
        { href: "/top-list", icon: Trophy, labelKey: "topList", show: true },
        {
          href: "/requests",
          icon: Search,
          labelKey: "requests",
          show: showRequests ?? false,
        },
      ],
    },
    {
      title: t("nav.sections.devices"),
      items: [
        {
          href: "/audiobook-app",
          icon: Smartphone,
          labelKey: "audiobookApp",
          show: permissions?.canGenerateApiKeys ?? false,
        },
        {
          href: "/e-reader",
          icon: TabletSmartphone,
          labelKey: "eReader",
          show: availability?.opds ?? false,
        },
      ],
    },
    {
      title: t("nav.sections.manage"),
      items: [
        {
          href: "/settings",
          icon: Settings,
          labelKey: "settings",
          show: isAdmin,
        },
        {
          href: "/admin/requests",
          icon: ClipboardList,
          labelKey: "manageRequests",
          show: isAdmin && (showRequests ?? false),
        },
        {
          href: "/metadata",
          icon: ListChecks,
          labelKey: "fixMetadata",
          show: showMetadataGaps,
        },
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
        <div ref={listRef} className="relative pl-3">
          <span
            ref={tubeRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-0.5 w-[3px] rounded-full bg-primary opacity-0"
            style={{ boxShadow: TUBE_GLOW }}
          />
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
                    touch={touch}
                    onClick={handleNavClick}
                    scroll={item.scroll}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Tasks indicator */}
      <TasksIndicator />

      {/* Account */}
      <div className="border-t border-border/50 px-2 py-2.5">
        <AccountMenu
          active={pathname.startsWith("/users/") || isActive("/preferences")}
          touch={touch}
          onNavigate={handleNavClick}
          onSignOut={handleSignOut}
        />
        <VersionBadge />
      </div>
    </aside>
  );
}
