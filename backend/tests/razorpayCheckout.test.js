import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

async function browser(t) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const scripts = []; const timers = [];
  globalThis.window = { setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {} };
  globalThis.document = { createElement: () => ({ remove() { this.removed = true; } }), head: { appendChild: script => scripts.push(script) } };
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
  const module = await import(`../../frontend/src/lib/razorpayCheckout.js?test=${randomUUID()}`);
  return { scripts, timers, ...module };
}

test('checkout loader uses the official script and shares an in-flight load', async t => {
  const h = await browser(t);
  const one = h.loadRazorpay(); const two = h.loadRazorpay();
  assert.equal(h.scripts.length, 1); assert.equal(h.scripts[0].src, 'https://checkout.razorpay.com/v1/checkout.js');
  window.Razorpay = class {};
  h.scripts[0].onload();
  assert.equal(await one, await two);
});

test('failed and timed-out script loads can be retried', async t => {
  const h = await browser(t);
  const failed = h.loadRazorpay(); h.scripts[0].onerror(); await assert.rejects(failed, /could not be loaded/);
  const timedOut = h.loadRazorpay(); h.timers.at(-1)(); await assert.rejects(timedOut, /too long/);
  const success = h.loadRazorpay(); window.Razorpay = class {}; h.scripts.at(-1).onload();
  assert.equal(await success, window.Razorpay);
});

test('subscription checkout sends subscription_id and resolves only the provider callback', async t => {
  const h = await browser(t);
  let options;
  window.Razorpay = class { constructor(config) { options = config; } on() {} open() {} };
  const pending = h.openSubscriptionCheckout({ keyId: 'public_key', subscriptionId: 'sub_ABC', name: 'Pro' }, { name: 'User', email: 'user@example.com' });
  await Promise.resolve();
  assert.equal(options.subscription_id, 'sub_ABC'); assert.equal(options.order_id, undefined); assert.equal(options.key, 'public_key');
  assert.equal(options.prefill.email, 'user@example.com');
  const result = { razorpay_payment_id: 'pay_ABC', razorpay_subscription_id: 'sub_ABC', razorpay_signature: 'signature' };
  options.handler(result); options.modal.ondismiss(); assert.deepEqual(await pending, result);
});

test('dismissing checkout does not report a successful subscription', async t => {
  const h = await browser(t); let options;
  window.Razorpay = class { constructor(config) { options = config; } on() {} open() {} };
  const pending = h.openSubscriptionCheckout({ keyId: 'public_key', subscriptionId: 'sub_ABC', name: 'Pro' }, {});
  await Promise.resolve(); options.modal.ondismiss(); assert.equal(await pending, null);
});
