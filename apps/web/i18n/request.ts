import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { defaultLocale, isValidLocale } from './config';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('locale')?.value;
  const locale = localeCookie && isValidLocale(localeCookie) ? localeCookie : defaultLocale;

  return {
    locale,
    messages: {
      common: (await import(`../messages/${locale}/common.json`)).default,
      auth: (await import(`../messages/${locale}/auth.json`)).default,
      settings: (await import(`../messages/${locale}/settings.json`)).default,
      preferences: (await import(`../messages/${locale}/preferences.json`)).default,
      library: (await import(`../messages/${locale}/library.json`)).default,
      audiobooks: (await import(`../messages/${locale}/audiobooks.json`)).default,
      ebooks: (await import(`../messages/${locale}/ebooks.json`)).default,
      eReader: (await import(`../messages/${locale}/eReader.json`)).default,
      home: (await import(`../messages/${locale}/home.json`)).default,
      player: (await import(`../messages/${locale}/player.json`)).default,
      requests: (await import(`../messages/${locale}/requests.json`)).default,
      admin: (await import(`../messages/${locale}/admin.json`)).default,
      lists: (await import(`../messages/${locale}/lists.json`)).default,
    },
  };
});
