"use client";

import { useTranslations } from "next-intl";
import { useVersion } from "../../lib/use-version";

/**
 * Version marker at the foot of the sidebar. Shows the real version of the
 * running image (see /api/version), with a `pre-alpha` tag while the major
 * version is still 0. Renders the divider alone rather than a guessed version
 * when the lookup hasn't landed.
 */
export function VersionBadge() {
  const t = useTranslations("common.version");
  const { version } = useVersion();

  const isPreRelease = version?.baseVersion.startsWith("0.") ?? false;
  const label = version
    ? `v${version.baseVersion}${version.channel === "dev" ? ` · ${t("devBuild")}` : ""}`
    : null;

  return (
    <div className="mt-3 flex items-center gap-2 px-3">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-muted-foreground/20 to-transparent" />
      {label && (
        <span
          // Full describe string + commit are only interesting when someone is
          // filing a bug, so they live in the tooltip rather than the sidebar.
          title={t("buildDetails", {
            version: version!.version,
            sha: version!.gitSha,
          })}
          className="whitespace-nowrap text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50"
        >
          {isPreRelease && <>{t("preAlpha")} · </>}
          {label}
        </span>
      )}
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-muted-foreground/20 to-transparent" />
    </div>
  );
}
