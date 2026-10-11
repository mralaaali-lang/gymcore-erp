import { executeDailySubscriptionCleanupAndAlerts } from '../../src/cron/subscriptionCleanup';

describe('Cron Job — Subscription Cleanup', () => {
  it('executes without throwing', async () => {
    await expect(executeDailySubscriptionCleanupAndAlerts()).resolves.not.toThrow();
  });

  it('handles empty result sets gracefully', async () => {
    const result = await executeDailySubscriptionCleanupAndAlerts();
    expect(result).toBeUndefined();
  });
});
