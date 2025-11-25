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
      ...(await import(`../messages/${locale}/common.json`)).default,
      ...(await import(`../messages/${locale}/auth.json`)).default,
      ...(await import(`../messages/${locale}/settings.json`)).default,
      ...(await import(`../messages/${locale}/library.json`)).default,
    },
  };
});
