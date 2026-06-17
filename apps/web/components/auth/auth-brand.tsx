import { useTranslations } from "next-intl";

/**
 * Branded wordmark for the auth screen. Uses the same neon display font as the
 * in-app logo but renders in the active theme's primary color (instead of the
 * randomized rainbow) so it stays cohesive with whatever palette the instance
 * is themed with.
 */
export function AuthBrand() {
  const t = useTranslations("auth");

  return (
    <div className="mb-8 flex flex-col items-center gap-2 text-center">
      <span
        className="select-none font-[family-name:var(--font-neonderthaw)] text-6xl leading-none text-primary"
        style={{
          textShadow:
            "0 0 10px hsl(var(--primary) / 0.65), 0 0 28px hsl(var(--primary) / 0.4)",
        }}
      >
        bookmarks
      </span>
      <p className="text-sm text-muted-foreground">{t("tagline")}</p>
    </div>
  );
}
