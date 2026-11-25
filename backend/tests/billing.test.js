import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createBillingService } from '../services/billing.service.js';
import { createBillingHandlers } from '../controllers/billing.controller.js';
import { verifyHmac } from '../utils/razorpay.js';
import { grantInvoiceCredits, reverseInvoiceCredits } from '../services/billingCredits.js';
import { repository } from './helpers/billingFixtures.js';

const settings = { keyId: 'rzp_test_example', keySecret: 'test-api-secret', webhookSecret: 'different-webhook-secret' };
const sign = (value, secret = settings.keySecret) => createHmac('sha256', secret).update(value).digest('hex');
async function harness() {
  const User = repository({ credits: 100, billingDebt: 0, billingCreditsApplied: [], billingRefunds: {} });
  await User.create({ _id: 'owner', name: 'Owner', email: 'owner@example.com' });
  const Subscription = repository({ status: 'creating', open: true, paidCount: 0, cancelAtPeriodEnd: false }, [
    (a, b) => a.userId === b.userId && a.keyId === b.keyId && a.open && b.open,
    (a, b) => a.userId === b.userId && a.keyId === b.keyId && a.requestId === b.requestId,
  ]);
  const BillingPlan = repository();
  const Payment = repository({}, [(a, b) => a.keyId === b.keyId && (a.razorpayInvoiceId === b.razorpayInvoiceId || a.razorpayPaymentId === b.razorpayPaymentId)]);
  const remote = { id: 'sub_ABC', plan_id: 'plan_ABC', quantity: 1, status: 'created', paid_count: 0, current_start: 1795564800, current_end: 1798156800, charge_at: 1798156800 };
  const payments = new Map(); const invoices = new Map(); const calls = [];
  const client = {
    async createPlan(data) { calls.push(['createPlan', data]); return { id: 'plan_ABC' }; },
    async createSubscription(data) { calls.push(['createSubscription', data]); Object.assign(remote, { plan_id: data.plan_id }); return structuredClone(remote); },
    async getSubscription(id) { calls.push(['getSubscription', id]); return structuredClone(remote); },
    async getPayment(id) { calls.push(['getPayment', id]); assert(payments.has(id), `Missing payment ${id}`); return structuredClone(payments.get(id)); },
    async getInvoice(id) { assert(invoices.has(id)); return structuredClone(invoices.get(id)); },
    async listInvoices(_, skip) { return { items: [...invoices.values()].slice(skip, skip + 100) }; },
    async cancelSubscription(id, atEnd) { calls.push(['cancel', id, atEnd]); if (!atEnd) remote.status = 'cancelled'; return structuredClone(remote); },
  };
  const dependencies = { User, Subscription, BillingPlan, Payment, config: () => settings, getClient: () => client,
    grant: args => grantInvoiceCredits(args, User), reverse: args => reverseInvoiceCredits(args, User) };
  const service = createBillingService(dependencies);
  const subscribe = () => service.subscribe('owner', { plan: 'pro', requestId: randomUUID() });
  function addCharge(suffix = 'One', overrides = {}) {
    const payment = { id: `pay_${suffix}`, invoice_id: `inv_${suffix}`, order_id: `order_${suffix}`, status: 'captured', amount: 79900, currency: 'INR', amount_refunded: 0, created_at: 1795564800, ...overrides };
    const invoice = { id: `inv_${suffix}`, subscription_id: remote.id, payment_id: payment.id, order_id: payment.order_id, status: 'paid', amount: 79900, amount_paid: 79900, currency: 'INR', paid_at: 1795564800, short_url: 'https://rzp.io/i/receipt', line_items: [{ type: 'plan', amount: 79900, quantity: 1 }] };
    payments.set(payment.id, payment); invoices.set(invoice.id, invoice);
    remote.status = 'active'; remote.paid_count++;
    return { payment, invoice, result: { razorpay_subscription_id: remote.id, razorpay_payment_id: payment.id, razorpay_signature: sign(`${payment.id}|${remote.id}`) } };
  }
  async function event(name, paymentId, subscription = true) {
    const body = Buffer.from(JSON.stringify({ event: name, payload: { ...(subscription ? { subscription: { entity: { id: remote.id, status: 'old_snapshot' } } } : {}), ...(paymentId ? { payment: { entity: { id: paymentId } } } : {}) } }));
    return service.webhook(body, sign(body, settings.webhookSecret));
  }
  return { ...dependencies, service, subscribe, addCharge, event, client, remote, payments, invoices, calls, balance: () => User.records.get('owner').credits };
}

test('HMAC verifies exact raw bytes and uses separate subscription and webhook secrets', () => {
  const bytes = Buffer.from('{ "event": "subscription.charged" }');
  assert(verifyHmac(bytes, sign(bytes), settings.keySecret));
  assert.equal(verifyHmac(Buffer.from('{"event":"subscription.charged"}'), sign(bytes), settings.keySecret), false);
  assert.equal(verifyHmac(bytes, sign(bytes), settings.webhookSecret), false);
  for (const signature of ['', 'z'.repeat(64), 'f'.repeat(63), null]) assert.equal(verifyHmac(bytes, signature, settings.keySecret), false);
});

test('plans and subscription price are server-owned and provider templates are created automatically', async () => {
  const h = await harness(); const checkout = await h.subscribe();
  assert.equal(checkout.amount, 79900); assert.equal(checkout.credits, 3000); assert.equal(checkout.keyId, settings.keyId);
  assert.equal(h.calls[0][1].period, 'monthly'); assert.equal(h.calls[0][1].item.amount, 79900);
  const creation = h.calls.find(c => c[0] === 'createSubscription')[1];
  assert.equal(creation.quantity, 1); assert.equal(creation.total_count, 1200); assert(creation.notes.app_subscription_id);
  await assert.rejects(h.service.subscribe('owner', { plan: 'pro', requestId: randomUUID(), amount: 1 }));
  await assert.rejects(h.service.subscribe('owner', { plan: 'starter', requestId: randomUUID() }));
  assert.equal(h.balance(), 100);
});

test('resuming checkout reuses its subscription and parallel requests cannot create two mandates', async () => {
  const h = await harness();
  const results = await Promise.allSettled([h.subscribe(), h.subscribe()]);
  assert(results.some(r => r.status === 'fulfilled'));
  assert.equal(h.calls.filter(c => c[0] === 'createSubscription').length, 1);
  const resumed = await h.subscribe(); assert.equal(resumed.subscriptionId, 'sub_ABC');
  assert.equal(h.calls.filter(c => c[0] === 'createSubscription').length, 1);
  h.remote.status = 'active';
  await assert.rejects(h.subscribe(), { status: 409 });
});

test('ambiguous subscription creation is kept open and cannot be blindly retried', async () => {
  const h = await harness(); h.client.createSubscription = async () => { h.calls.push(['uncertainCreate']); throw new Error('timeout'); };
  await assert.rejects(h.subscribe(), /timeout/);
  assert.equal([...h.Subscription.records.values()][0].status, 'setup_unknown');
  await assert.rejects(h.subscribe(), { status: 409 });
  assert.equal(h.calls.filter(c => c[0] === 'uncertainCreate').length, 1);
});

test('a definite provider rejection releases the unpaid subscription slot', async () => {
  const h = await harness(); h.client.createSubscription = async () => { throw Object.assign(new Error('Invalid plan'), { response: { status: 400 } }); };
  await assert.rejects(h.subscribe());
  assert.equal([...h.Subscription.records.values()][0].open, false);
});

test('checkout verification and repeated renewal webhooks grant each monthly invoice exactly once', async () => {
  const h = await harness(); await h.subscribe(); const first = h.addCharge();
  const verified = await h.service.verify('owner', first.result);
  assert.equal(verified.paymentConfirmed, true); assert.equal(h.balance(), 3100);
  await Promise.all([h.service.verify('owner', first.result), h.event('subscription.charged', first.payment.id), h.event('payment.captured', first.payment.id, false)]);
  assert.equal(h.balance(), 3100); assert.equal(h.Payment.records.size, 1);
  const renewal = h.addCharge('Two'); await h.event('subscription.charged', renewal.payment.id);
  assert.equal(h.balance(), 6100); assert.equal(h.Payment.records.size, 2);
});

test('invalid signatures and another account cannot confirm a payment', async () => {
  const h = await harness(); await h.subscribe(); const charge = h.addCharge();
  await assert.rejects(h.service.verify('owner', { ...charge.result, razorpay_signature: '0'.repeat(64) }), { status: 400 });
  await assert.rejects(h.service.verify('intruder', charge.result), { status: 404 });
  assert.equal(h.balance(), 100);
});

test('a mandate authorisation or an uncaptured payment grants no monthly credits', async () => {
  const h = await harness(); await h.subscribe();
  const auth = h.addCharge('Auth', { invoice_id: null, amount: 100, status: 'authorized' });
  const verified = await h.service.verify('owner', auth.result);
  assert.equal(verified.paymentConfirmed, false); assert.equal(h.balance(), 100);
  const uncaptured = h.addCharge('Pending', { status: 'authorized' });
  await h.service.verify('owner', uncaptured.result); assert.equal(h.balance(), 100);
});

test('invoice amount, currency, ownership and plan item must match before granting credits', async () => {
  for (const mutation of [invoice => { invoice.subscription_id = 'sub_Other'; }, invoice => { invoice.amount = 100; }, invoice => { invoice.currency = 'USD'; }, invoice => { invoice.line_items[0].type = 'addon'; }, invoice => { invoice.payment_id = 'pay_Other'; }]) {
    const h = await harness(); await h.subscribe(); const charge = h.addCharge(); mutation(charge.invoice);
    await assert.rejects(h.service.verify('owner', charge.result), { status: 409 }); assert.equal(h.balance(), 100);
  }
});

test('refresh reconciles a captured invoice after the browser callback was lost', async () => {
  const h = await harness(); await h.subscribe(); h.addCharge();
  const refreshed = await h.service.refresh('owner');
  assert.equal(refreshed.user.credits, 3100); assert.equal(refreshed.payments.length, 1);
  await h.service.refresh('owner'); assert.equal(h.balance(), 3100);
  assert.equal('billingCreditsApplied' in refreshed.user, false);
});

test('cancellation stops renewal at cycle end and does not remove paid credits', async () => {
  const h = await harness(); await h.subscribe(); const charge = h.addCharge(); await h.service.verify('owner', charge.result);
  const cancelled = await h.service.cancel('owner');
  assert.equal(cancelled.subscription.cancelAtPeriodEnd, true); assert.equal(h.balance(), 3100);
  assert.deepEqual(h.calls.find(c => c[0] === 'cancel'), ['cancel', 'sub_ABC', true]);
  await h.service.cancel('owner'); assert.equal(h.calls.filter(c => c[0] === 'cancel').length, 1);
});

test('discarding an unpaid checkout cancels immediately', async () => {
  const h = await harness(); await h.subscribe();
  const cancelled = await h.service.cancel('owner');
  assert.equal(cancelled.subscription.open, false); assert.equal(h.balance(), 100);
  assert.deepEqual(h.calls.find(c => c[0] === 'cancel'), ['cancel', 'sub_ABC', false]);
});

test('delayed lifecycle payloads cannot restore an already cancelled subscription', async () => {
  const h = await harness(); await h.subscribe(); h.remote.status = 'cancelled';
  await h.event('subscription.activated');
  const state = await h.service.snapshot('owner'); assert.equal(state.subscription.status, 'cancelled'); assert.equal(state.subscription.open, false);
});

test('webhooks reject unsigned/parsed payloads and acknowledge unrelated events', async () => {
  const h = await harness();
  await assert.rejects(h.service.webhook(Buffer.from('{}'), '0'.repeat(64)), { status: 400 });
  await assert.rejects(h.service.webhook({}, sign('{}', settings.webhookSecret)), { status: 400 });
  assert.equal((await h.event('order.paid')).ignored, true);
});

test('full refunds reverse only once and consumed refunded credits become debt', async () => {
  const h = await harness(); await h.subscribe(); const charge = h.addCharge(); await h.service.verify('owner', charge.result);
  h.User.records.get('owner').credits = 200;
  charge.payment.amount_refunded = 79900; charge.payment.status = 'refunded';
  await h.event('payment.refunded', charge.payment.id, false); await h.event('payment.refunded', charge.payment.id, false);
  assert.equal(h.balance(), 0); assert.equal(h.User.records.get('owner').billingDebt, 2800);
  const renewal = h.addCharge('Two'); await h.event('subscription.charged', renewal.payment.id);
  assert.equal(h.balance(), 200); assert.equal(h.User.records.get('owner').billingDebt, 0);
});

test('partial refunds revoke only the additional cumulative proportion of credits', async () => {
  const h = await harness(); await h.subscribe(); const charge = h.addCharge(); await h.service.verify('owner', charge.result);
  charge.payment.amount_refunded = 39950;
  await h.event('refund.processed', charge.payment.id, false); await h.event('refund.processed', charge.payment.id, false);
  assert.equal(h.balance(), 1600);
  charge.payment.amount_refunded = 79900; charge.payment.status = 'refunded';
  await h.event('payment.refunded', charge.payment.id, false); assert.equal(h.balance(), 100);
});

test('refund delivery before credit grant prevents a stale captured event from funding refunded credits', async () => {
  const h = await harness(); const args = { userId: 'owner', invoiceKey: 'key:inv_one', credits: 3000 };
  await reverseInvoiceCredits(args, h.User);
  await grantInvoiceCredits(args, h.User);
  await grantInvoiceCredits(args, h.User);
  assert.equal(h.balance(), 100); assert.equal(h.User.records.get('owner').billingDebt, 0);
});

test('credit pipelines initialize existing accounts and use atomic update markers', async () => {
  const h = await harness(); delete h.User.records.get('owner').credits; delete h.User.records.get('owner').billingRefunds;
  const args = { userId: 'owner', invoiceKey: 'key:inv_one', credits: 3000 };
  await Promise.all(Array.from({ length: 5 }, () => grantInvoiceCredits(args, h.User)));
  assert.equal(h.balance(), 3100);
});

test('receipt write failure after a credit grant is recoverable without a duplicate grant', async () => {
  const h = await harness(); await h.subscribe(); const charge = h.addCharge();
  const update = h.Payment.updateOne;
  let fail = true;
  h.Payment.updateOne = async (...args) => { if (fail && args[1].$set?.status === 'credited') { fail = false; throw new Error('database unavailable after grant'); } return update.call(h.Payment, ...args); };
  await assert.rejects(h.service.verify('owner', charge.result), /database unavailable/);
  assert.equal(h.balance(), 3100);
  await h.service.verify('owner', charge.result); assert.equal(h.balance(), 3100);
  assert.equal([...h.Payment.records.values()][0].status, 'credited');
});

test('a partial refund received before the initial grant reduces only the earned allowance', async () => {
  const h = await harness();
  await reverseInvoiceCredits({ userId: 'owner', invoiceKey: 'key:inv_one', credits: 1500 }, h.User);
  await grantInvoiceCredits({ userId: 'owner', invoiceKey: 'key:inv_one', credits: 3000 }, h.User);
  assert.equal(h.balance(), 1600); assert.equal(h.User.records.get('owner').billingDebt, 0);
  await reverseInvoiceCredits({ userId: 'owner', invoiceKey: 'key:inv_one', credits: 3000 }, h.User);
  assert.equal(h.balance(), 100);
});

test('billing handler never returns provider credentials or raw Axios errors', async () => {
  const error = Object.assign(new Error('secret in provider details'), { config: { auth: { password: 'secret' } }, response: { status: 401 } });
  const handlers = createBillingHandlers({ snapshot: async () => { throw error; } });
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handlers.getBilling({ user: { _id: 'owner' } }, res);
  assert.equal(res.code, 502); assert.equal(JSON.stringify(res.body).includes('secret'), false);
});

test('missing billing secrets disable checkout without making provider calls', async () => {
  const h = await harness(); const service = createBillingService({ ...h, config: () => ({}) });
  const view = await service.snapshot('owner'); assert.equal(view.configured, false);
  await assert.rejects(service.subscribe('owner', { plan: 'pro', requestId: randomUUID() }), { status: 503 });
  assert.equal(h.calls.length, 0);
});
