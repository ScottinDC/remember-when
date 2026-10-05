/** Never release a reservation automatically: failure can follow provider acceptance. */
export async function deliverOnce(
  reserve: () => Promise<boolean>,
  send: () => Promise<string | null>,
  markAccepted: (messageId: string | null) => Promise<void>,
): Promise<{ skipped: true } | { skipped: false; messageId: string | null }> {
  if (!(await reserve())) return { skipped: true };
  const messageId = await send();
  await markAccepted(messageId);
  return { skipped: false, messageId };
}
