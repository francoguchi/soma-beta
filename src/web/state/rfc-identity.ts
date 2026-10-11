/** Canonical RFC external identity only: NC followed by exactly 14 ASCII digits. */
export function isExactRfcIdentity(value:string):boolean {
  return /^NC[0-9]{14}$/.test(value);
}
