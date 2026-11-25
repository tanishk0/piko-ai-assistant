import z from 'zod';
import SubscriptionModel from '../models/subscription.model.js';
import BillingPlanModel from '../models/billingPlan.model.js';
import PaymentModel from '../models/payment.model.js';
import UserModel from '../models/user.model.js';
import { BILLING_PLANS, BILLING_CYCLES, TERMINAL_SUBSCRIPTION_STATES } from '../config/billingPlans.js';
import { createRazorpayClient, razorpayConfig, verifyHmac } from '../utils/razorpay.js';
import { grantInvoiceCredits, reverseInvoiceCredits } from './billingCredits.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const identifier = prefix => z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9]+$`)).max(100);
export const subscribeInput = z.object({ plan: z.enum(['pro', 'team']), requestId: z.string().uuid() }).strict();
export const verificationInput = z.object({ razorpay_subscription_id: identifier('sub'), razorpay_payment_id: identifier('pay'), razorpay_signature: z.string().regex(/^[a-f\d]{64}$/i) }).strict();
const date = seconds => seconds ? new Date(seconds * 1000) : null;
const publicSubscription = record => record ? {
  id: record._id.toString(), plan: record.plan, status: record.status, open: record.open,
  amount: record.amount, currency: record.currency, creditsPerMonth: record.credits,
  currentStart: record.currentStart, currentEnd: record.currentEnd, nextChargeAt: record.nextChargeAt,
  cancelAtPeriodEnd: record.cancelAtPeriodEnd, paidCount: record.paidCount,
  canResumeCheckout: record.status === 'created',
} : null;

export function createBillingService(overrides = {}) {
  const { Subscription, BillingPlan, Payment, User, config, getClient, grant, reverse } = {
    Subscription: SubscriptionModel, BillingPlan: BillingPlanModel, Payment: PaymentModel, User: UserModel,
    config: razorpayConfig, getClient: createRazorpayClient, grant: grantInvoiceCredits, reverse: reverseInvoiceCredits,
    ...overrides,
  };
  const configured = () => Boolean(config().keyId && config().keySecret && config().webhookSecret);
  const provider = () => {
    if (!configured()) throw fail(503, 'Subscription billing is not configured yet.');
    return getClient(config());
  };
  const scope = userId => ({ userId, keyId: config().keyId || 'unconfigured' });
  async function current(userId) {
    return await Subscription.findOne({ ...scope(userId), open: true }) || await Subscription.findOne(scope(userId)).sort({ createdAt: -1 });
  }
  async function snapshot(userId) {
    const [subscription, user, payments] = await Promise.all([
      current(userId), User.findById(userId).select('name email profilePicture credits billingDebt'),
      Payment.find(scope(userId)).sort({ createdAt: -1 }).limit(20),
    ]);
    if (!user) throw fail(404, 'Account not found.');
    return { configured: configured(), plans: Object.values(BILLING_PLANS), subscription: publicSubscription(subscription),
      user, creditPolicy: 'Each paid monthly invoice adds credits. Unused credits roll over. Cancellation stops future renewals and keeps paid credits.',
      payments: payments.map(p => ({ id: p._id.toString(), plan: p.plan, amount: p.amount, currency: p.currency, credits: p.credits, status: p.status, paidAt: p.paidAt, receiptUrl: p.receiptUrl })),
    };
  }
  async function syncSubscription(record, client = provider()) {
    const syncStartedAt = new Date();
    const remote = await client.getSubscription(record.razorpaySubscriptionId);
    if (remote.id !== record.razorpaySubscriptionId || remote.plan_id !== record.razorpayPlanId || remote.quantity !== 1) throw fail(409, 'Subscription does not match its stored plan.');
    const update = { status: remote.status, open: !TERMINAL_SUBSCRIPTION_STATES.has(remote.status), currentStart: date(remote.current_start), currentEnd: date(remote.current_end), nextChargeAt: date(remote.charge_at), paidCount: remote.paid_count || 0, lastSyncedAt: syncStartedAt };
    if (!update.open) update.cancelAtPeriodEnd = false;
    const saved = await Subscription.findOneAndUpdate({ _id: record._id, $or: [{ lastSyncedAt: { $exists: false } }, { lastSyncedAt: { $lte: syncStartedAt } }] }, { $set: update }, { returnDocument: 'after' });
    return saved || await Subscription.findById(record._id);
  }
  async function ensurePlan(plan, client) {
    const key = `${config().keyId}:${plan.id}:${plan.amount}:${plan.credits}`;
    const existing = await BillingPlan.findById(key);
    if (existing) return existing.razorpayPlanId;
    const remote = await client.createPlan({ period: 'monthly', interval: 1, item: { name: `Automate AI ${plan.name}`, amount: plan.amount, currency: plan.currency, description: `${plan.credits} credits each month` } });
    const saved = await BillingPlan.findOneAndUpdate({ _id: key }, { $setOnInsert: { razorpayPlanId: remote.id } }, { upsert: true, returnDocument: 'after' });
    return saved.razorpayPlanId;
  }
  function checkout(record) {
    if (!record.razorpaySubscriptionId) throw fail(409, 'Subscription setup is pending. Refresh billing before trying again.');
    return { keyId: record.keyId, subscriptionId: record.razorpaySubscriptionId, plan: record.plan, name: BILLING_PLANS[record.plan].name, amount: record.amount, currency: record.currency, credits: record.credits, totalCycles: BILLING_CYCLES };
  }
  async function subscribe(userId, raw) {
    const input = subscribeInput.parse(raw);
    const client = provider();
    let existing = await current(userId);
    if (existing?.open && existing.razorpaySubscriptionId) existing = await syncSubscription(existing, client);
    if (existing?.open) {
      if (existing.plan !== input.plan || existing.status !== 'created') throw fail(409, 'You already have a subscription. Manage it before starting another plan.');
      return checkout(existing);
    }
    if (await Subscription.findOne({ ...scope(userId), requestId: input.requestId })) throw fail(409, 'This checkout request has already ended. Start a new checkout.');
    const plan = BILLING_PLANS[input.plan];
    let record;
    try { record = await Subscription.create({ ...scope(userId), requestId: input.requestId, plan: plan.id, amount: plan.amount, currency: plan.currency, credits: plan.credits }); }
    catch (error) { if (error.code === 11000) throw fail(409, 'Another subscription request is already in progress. Refresh billing.'); throw error; }
    let attemptedCreation = false;
    try {
      const planId = await ensurePlan(plan, client);
      await Subscription.updateOne({ _id: record._id }, { $set: { razorpayPlanId: planId } });
      attemptedCreation = true;
      const remote = await client.createSubscription({ plan_id: planId, quantity: 1, total_count: BILLING_CYCLES, customer_notify: true, expire_by: Math.floor(Date.now() / 1000) + 86400, notes: { app_subscription_id: record._id.toString(), user_id: userId.toString(), plan: plan.id } });
      record = await Subscription.findOneAndUpdate({ _id: record._id }, { $set: { razorpaySubscriptionId: remote.id, status: remote.status } }, { returnDocument: 'after' });
      return checkout(record);
    } catch (error) {
      const definiteRejection = error.response?.status >= 400 && error.response?.status < 500;
      await Subscription.updateOne({ _id: record._id }, { $set: { status: attemptedCreation && !definiteRejection ? 'setup_unknown' : 'setup_failed', open: attemptedCreation && !definiteRejection } }).catch(() => {});
      throw error;
    }
  }
  async function settle(record, payment, invoice) {
    if (invoice.subscription_id !== record.razorpaySubscriptionId || invoice.payment_id !== payment.id || payment.invoice_id !== invoice.id || payment.order_id !== invoice.order_id) throw fail(409, 'Payment is not linked to this subscription invoice.');
    if (payment.amount !== record.amount || payment.currency !== record.currency || invoice.amount !== record.amount || invoice.currency !== record.currency || !invoice.line_items?.some(item => item.type === 'plan' && item.amount === record.amount && item.quantity === 1)) throw fail(409, 'Invoice amount or plan does not match.');
    const invoiceKey = `${record.keyId}:${invoice.id}`;
    const refunded = payment.amount_refunded >= payment.amount || payment.status === 'refunded';
    if (!refunded && (payment.status !== 'captured' || invoice.status !== 'paid' || invoice.amount_paid !== record.amount)) return false;
    const receipt = await Payment.findOneAndUpdate({ keyId: record.keyId, razorpayInvoiceId: invoice.id }, { $setOnInsert: {
      userId: record.userId, subscriptionId: record._id, plan: record.plan, credits: record.credits, amount: record.amount, currency: record.currency,
      razorpaySubscriptionId: record.razorpaySubscriptionId, razorpayPaymentId: payment.id, razorpayOrderId: payment.order_id,
      status: refunded ? 'refunded' : 'captured', receiptUrl: invoice.short_url, paidAt: date(invoice.paid_at || payment.created_at),
    } }, { upsert: true, returnDocument: 'after', runValidators: true });
    if (refunded || payment.amount_refunded > 0) {
      const reversedCredits = refunded ? record.credits : Math.min(record.credits, Math.ceil(record.credits * payment.amount_refunded / record.amount));
      await reverse({ userId: record.userId, invoiceKey, credits: reversedCredits });
    }
    if (refunded) {
      await Payment.updateOne({ keyId: record.keyId, razorpayInvoiceId: invoice.id }, { $set: { status: 'refunded' } });
      return false;
    }
    if (receipt.status === 'refunded') return false;
    await grant({ userId: record.userId, invoiceKey, credits: record.credits });
    if (payment.amount_refunded > 0) await Payment.updateOne({ keyId: record.keyId, razorpayInvoiceId: invoice.id, status: { $ne: 'refunded' } }, { $set: { status: 'partially_refunded' } });
    else await Payment.updateOne({ keyId: record.keyId, razorpayInvoiceId: invoice.id, status: 'captured' }, { $set: { status: 'credited' } });
    return true;
  }
  async function settlePayment(record, paymentId, client = provider()) {
    const payment = await client.getPayment(paymentId);
    if (!payment.invoice_id) return false; // A mandate/auth payment is not a monthly allowance.
    const invoice = await client.getInvoice(payment.invoice_id);
    return settle(record, payment, invoice);
  }
  async function verify(userId, raw) {
    const input = verificationInput.parse(raw);
    const record = await Subscription.findOne({ ...scope(userId), razorpaySubscriptionId: input.razorpay_subscription_id });
    if (!record) throw fail(404, 'Subscription not found.');
    if (!verifyHmac(`${input.razorpay_payment_id}|${record.razorpaySubscriptionId}`, input.razorpay_signature, config().keySecret)) throw fail(400, 'Invalid payment signature.');
    const client = provider();
    const credited = await settlePayment(record, input.razorpay_payment_id, client);
    await syncSubscription(record, client);
    return { ...await snapshot(userId), paymentConfirmed: credited };
  }
  async function refresh(userId) {
    const client = provider();
    let record = await current(userId);
    if (record?.razorpaySubscriptionId) {
      record = await syncSubscription(record, client);
      // Recover missing callbacks/webhooks. Already applied invoices do not grant twice.
      for (let skip = 0; skip < 2000; skip += 100) {
        const page = await client.listInvoices(record.razorpaySubscriptionId, skip);
        for (const invoice of page.items || []) {
          if (invoice.status !== 'paid' || !invoice.payment_id) continue;
          const known = await Payment.findOne({ keyId: record.keyId, razorpayInvoiceId: invoice.id, status: 'credited' });
          if (!known) await settlePayment(record, invoice.payment_id, client);
        }
        if ((page.items || []).length < 100) break;
      }
    }
    return snapshot(userId);
  }
  async function cancel(userId) {
    let record = await current(userId);
    if (!record?.open || !record.razorpaySubscriptionId) throw fail(409, 'No subscription is available to cancel.');
    const client = provider();
    record = await syncSubscription(record, client);
    if (!record.open || record.cancelAtPeriodEnd) return snapshot(userId);
    const atEnd = ['active', 'pending', 'halted', 'paused'].includes(record.status) && Boolean(record.currentEnd);
    await client.cancelSubscription(record.razorpaySubscriptionId, atEnd);
    await Subscription.updateOne({ _id: record._id }, { $set: { cancelAtPeriodEnd: atEnd } });
    await syncSubscription(record, client);
    return snapshot(userId);
  }
  async function webhook(body, signature) {
    if (!configured()) throw fail(503, 'Billing is not configured.');
    if (!Buffer.isBuffer(body) || !verifyHmac(body, signature, config().webhookSecret)) throw fail(400, 'Invalid webhook signature.');
    let event;
    try { event = JSON.parse(body.toString('utf8')); } catch { throw fail(400, 'Invalid webhook payload.'); }
    const supported = event.event?.startsWith('subscription.') || ['payment.captured', 'payment.refunded', 'refund.processed'].includes(event.event);
    if (!supported) return { received: true, ignored: true };
    const client = provider();
    const subscriptionId = event.payload?.subscription?.entity?.id;
    const paymentId = event.payload?.payment?.entity?.id || event.payload?.refund?.entity?.payment_id;
    let record = subscriptionId ? await Subscription.findOne({ keyId: config().keyId, razorpaySubscriptionId: subscriptionId }) : null;
    if (!record && paymentId) {
      const payment = await client.getPayment(identifier('pay').parse(paymentId));
      if (!payment.invoice_id) return { received: true, ignored: true };
      const invoice = await client.getInvoice(payment.invoice_id);
      record = await Subscription.findOne({ keyId: config().keyId, razorpaySubscriptionId: invoice.subscription_id });
    }
    if (!record) return { received: true, ignored: true };
    if (paymentId) await settlePayment(record, identifier('pay').parse(paymentId), client);
    await syncSubscription(record, client); // Re-fetch current state rather than trusting event order.
    return { received: true };
  }
  return { snapshot, subscribe, verify, refresh, cancel, webhook };
}
