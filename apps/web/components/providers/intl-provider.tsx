"use client";

import { NextIntlClientProvider, AbstractIntlMessages } from "next-intl";

interface IntlProviderProps {
  locale: string;
  messages: AbstractIntlMessages;
  timeZone: string;
  children: React.ReactNode;
}

export function IntlProvider({
  locale,
  messages,
  timeZone,
  children,
}: IntlProviderProps) {
  // This is a client component, so NextIntlClientProvider resolves to the
  // client build, which does not inherit config from the server request -
  // timeZone has to be handed down explicitly to match what SSR rendered with.
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone={timeZone}
    >
      {children}
    </NextIntlClientProvider>
  );
}
