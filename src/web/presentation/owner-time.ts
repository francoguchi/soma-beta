/** Format an authoritative UTC epoch in the operator device's local timezone.
 * Never use toISOString() in visible UI; raw Z-suffixed UTC text is reserved
 * for transport and storage, not for a Windows/browser operator timestamp.
 */
export function formatOwnerLocalTime(epochSeconds:number):string {
  if(!Number.isSafeInteger(epochSeconds)||epochSeconds<0||epochSeconds>8640000000000)
    throw new Error('Invalid owner instant');
  return new Date(epochSeconds*1000).toLocaleString(undefined,{
    dateStyle:'medium',timeStyle:'short',
  });
}
