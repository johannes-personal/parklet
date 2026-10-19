/** Reserved for documentation and testing (RFC 2606, RFC 6761): never send real mail there. */
const RESERVED = /(\.(test|example|invalid|localhost)|@example\.(com|net|org))$/i;

/** Whether an address can receive real mail. The demo accounts use @parklet.test. */
export function isDeliverableAddress(address: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) && !RESERVED.test(address);
}
