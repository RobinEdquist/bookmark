import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { defaultLocale, isValidLocale } from "./config";

/**
 * The zone this process is actually running in, resolved once: it cannot change
 * while the process lives. Outside Docker this is the machine's own zone, so a
 * bare-metal install follows the server clock without being told to. Inside
 * Docker it comes out as UTC - containers do not inherit the host's zone, and
 * the usual `/etc/localtime` bind-mount does not help, because Node takes the
 * zone *name* from the symlink path rather than the file contents. `TZ` is the
 * only thing that moves it.
 */
const RUNTIME_TIME_ZONE =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("locale")?.value;
  const locale =
    localeCookie && isValidLocale(localeCookie) ? localeCookie : defaultLocale;

  return {
    locale,
    // Must be set explicitly rather than left to next-intl: the value is handed
    // to the client provider so SSR and hydration format against the same zone
    // instead of the server's and the browser's diverging.
    timeZone: process.env.TZ || RUNTIME_TIME_ZONE,
    messages: {
      common: (await import(`../messages/${locale}/common.json`)).default,
      auth: (await import(`../messages/${locale}/auth.json`)).default,
      settings: (await import(`../messages/${locale}/settings.json`)).default,
      preferences: (await import(`../messages/${locale}/preferences.json`))
        .default,
      library: (await import(`../messages/${locale}/library.json`)).default,
      audiobooks: (await import(`../messages/${locale}/audiobooks.json`))
        .default,
      ebooks: (await import(`../messages/${locale}/ebooks.json`)).default,
      eReader: (await import(`../messages/${locale}/eReader.json`)).default,
      audiobookApp: (await import(`../messages/${locale}/audiobookApp.json`))
        .default,
      home: (await import(`../messages/${locale}/home.json`)).default,
      player: (await import(`../messages/${locale}/player.json`)).default,
      requests: (await import(`../messages/${locale}/requests.json`)).default,
      admin: (await import(`../messages/${locale}/admin.json`)).default,
      lists: (await import(`../messages/${locale}/lists.json`)).default,
      series: (await import(`../messages/${locale}/series.json`)).default,
      userProfile: (await import(`../messages/${locale}/userProfile.json`))
        .default,
      comics: (await import(`../messages/${locale}/comics.json`)).default,
      comicvine: (await import(`../messages/${locale}/comicvine.json`)).default,
    },
  };
});
