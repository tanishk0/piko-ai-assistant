export const BILLING_PLANS = Object.freeze({
  pro: Object.freeze({ id: 'pro', name: 'Pro', amount: 79900, currency: 'INR', credits: 3000 }),
  team: Object.freeze({ id: 'team', name: 'Teams', amount: 99900, currency: 'INR', credits: 5000 }),
});
export const BILLING_CYCLES = 1200;
export const TERMINAL_SUBSCRIPTION_STATES = new Set(['cancelled', 'completed', 'expired']);
