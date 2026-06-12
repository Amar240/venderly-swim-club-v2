/**
 * Polls an async assertion until it passes or times out. Used for state the
 * webhook event log writes asynchronously after the HTTP response is sent.
 */
export const waitFor = async (assertion: () => Promise<void>, timeoutMs = 2000, intervalMs = 50): Promise<void> => {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (Date.now() >= deadline) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
};
