"use client";

import { useTranslations } from "next-intl";
import { useVersion } from "../../lib/use-version";

/**
 * Version marker at the foot of the sidebar. Shows the real version of the
 * running image (see /api/version), with a `pre-alpha` tag while the major
 * version is still 0. Renders the divider alone rather than a guessed version
 * when the lookup hasn't landed.
 *
 * When a newer release exists, the version turns into a link to its notes with
 * a pulsing dot. Deliberately understated: this sits in the sidebar on every
 * page, so it must not read as an error state.
 */
export function VersionBadge() {
  const t = useTranslations("common.version");
  const { version } = useVersion();

  const divider = (
    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-muted-foreground/20 to-transparent" />
  );

  if (!version) {
    return (
      <div className="mt-3 flex items-center gap-2 px-3">
        {divider}
        {divider}
      </div>
    );
  }

  const isPreRelease = version.baseVersion.startsWith("0.");
  const update = version.update?.available ? version.update : null;
  const label = `v${version.baseVersion}${version.channel === "dev" ? ` · ${t("devBuild")}` : ""}`;
  // Full describe string + commit are only interesting when someone is filing a
  // bug, so they live in the tooltip rather than the sidebar.
  const buildDetails = t("buildDetails", {
    version: version.version,
    sha: version.gitSha,
  });

  return (
    <div className="mt-3 flex items-center gap-2 px-3">
      {divider}
      {update ? (
        <a
          href={update.releaseUrl ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          title={`${buildDetails}\n${t("updateAvailable", { version: update.latestVersion })}`}
          className="group flex items-center gap-1.5 whitespace-nowrap text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          <span>{t("updateShort", { version: update.latestVersion })}</span>
        </a>
      ) : (
        <span
          title={buildDetails}
          className="whitespace-nowrap text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50"
        >
          {isPreRelease && <>{t("preAlpha")} · </>}
          {label}
        </span>
      )}
      {divider}
    </div>
  );
}
