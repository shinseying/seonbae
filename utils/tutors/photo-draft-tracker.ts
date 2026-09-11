/** Tracks only freshly uploaded photos that have not been saved to a tutor row. */
export function createTutorPhotoDraftTracker() {
  const pendingByCard = new Map<string, string>();

  return {
    replace(cardKey: string, path: string) {
      const previous = pendingByCard.get(cardKey);
      pendingByCard.set(cardKey, path);
      return previous && previous !== path ? [previous] : [];
    },

    commit(cardKey: string, savedPath: string | null | undefined) {
      const pending = pendingByCard.get(cardKey);
      pendingByCard.delete(cardKey);
      return pending && pending !== savedPath ? [pending] : [];
    },

    abandon(cardKey: string) {
      const pending = pendingByCard.get(cardKey);
      pendingByCard.delete(cardKey);
      return pending ? [pending] : [];
    },

    abandonAll() {
      const paths = [...new Set(pendingByCard.values())];
      pendingByCard.clear();
      return paths;
    },
  };
}
