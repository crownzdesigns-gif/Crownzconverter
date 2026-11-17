/**
 * Hand-off store: the homepage drop zone stashes files here, then navigates
 * to a tool page which claims them on mount. Kept in memory on purpose —
 * files never touch storage.
 */
let pending: File[] = [];

export function stashFiles(files: File[]) {
  pending = files;
}

export function claimFiles(): File[] {
  const f = pending;
  pending = [];
  return f;
}
