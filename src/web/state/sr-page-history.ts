/** Bounded SR keyset-cursor history, independent of React and browser APIs. */
export type SrPageHistory = Readonly<{
  paths: readonly string[];
  first: number;
  page: number;
}>;
const CAPACITY = 51;

export function initialSrPageHistory(firstPath: string): SrPageHistory {
  return {paths: [firstPath], first: 0, page: 0};
}

export function currentSrPagePath(history: SrPageHistory): string {
  const offset = history.page - history.first;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= history.paths.length) {
    throw new Error('Invalid SR cursor history');
  }
  return history.paths[offset];
}

export function previousSrPage(history: SrPageHistory): SrPageHistory {
  return history.page === history.first ? history : {...history, page: history.page - 1};
}

export function nextSrPage(history: SrPageHistory, nextPath: string): SrPageHistory {
  if (!nextPath.startsWith('/api/v1/tickets/service-requests?limit=25&cursor=') || nextPath.length > 4096) {
    throw new Error('Invalid SR continuation route');
  }
  const retained = [...history.paths.slice(0, history.page - history.first + 1), nextPath];
  const dropped = Math.max(0, retained.length - CAPACITY);
  return {paths: retained.slice(dropped), first: history.first + dropped, page: history.page + 1};
}
