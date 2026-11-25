let checkoutScript;
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!checkoutScript) checkoutScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    const timer = window.setTimeout(() => { script.remove(); checkoutScript = null; reject(new Error('Checkout took too long to load. Check your connection and try again.')); }, 20000);
    script.onload = () => { window.clearTimeout(timer); if (window.Razorpay) resolve(window.Razorpay); else { checkoutScript = null; reject(new Error('Checkout could not be loaded.')); } };
    script.onerror = () => { window.clearTimeout(timer); script.remove(); checkoutScript = null; reject(new Error('Checkout could not be loaded. Check your connection and try again.')); };
    document.head.appendChild(script);
  });
  return checkoutScript;
}

export async function openSubscriptionCheckout(subscription, user) {
  const Razorpay = await loadRazorpay();
  return new Promise((resolve, reject) => {
    let settled = false;
    const checkout = new Razorpay({
      key: subscription.keyId, subscription_id: subscription.subscriptionId,
      name: 'Automate AI', description: `${subscription.name} · monthly subscription`,
      prefill: { name: user?.name || '', email: user?.email || '' },
      theme: { color: '#7c3aed' },
      handler: result => { settled = true; resolve(result); },
      modal: { ondismiss: () => { if (!settled) { settled = true; resolve(null); } } },
    });
    // A failed attempt can be retried inside Checkout; dismiss only ends this flow.
    checkout.on('payment.failed', event => {
      if (event.error?.code === 'BAD_REQUEST_ERROR' && !settled) { settled = true; checkout.close(); reject(new Error('Checkout could not start. Refresh billing and try again.')); }
    });
    checkout.open();
  });
}
