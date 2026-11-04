"use client";

import type { ReactNode } from "react";
import { ServerLocaleContext, type SeonbaeLocale } from "./client";

// Carries the server's locale decision into the client tree so every
// useSeonbaeLocale() call hydrates against the same value the server printed.
export default function ServerLocaleProvider({
  locale,
  children,
}: {
  locale: SeonbaeLocale;
  children: ReactNode;
}) {
  return <ServerLocaleContext.Provider value={locale}>{children}</ServerLocaleContext.Provider>;
}
