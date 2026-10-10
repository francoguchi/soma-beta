/** Exact identity syntax, independent of React or browser module resolution. */
const SR_IDENTITY = /^(?:[0-9]{8}|LSR-[0-9]{8})$/;

export function isExactSrIdentity(value: string): boolean {
  return SR_IDENTITY.test(value);
}
