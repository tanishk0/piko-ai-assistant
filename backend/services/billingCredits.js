import User from '../models/user.model.js';

// Both the credit change and its deduplication marker live in a single atomic
// user update. Retrying after a webhook/callback or process crash cannot add twice.
export async function grantInvoiceCredits({ userId, invoiceKey, credits }, repository = User) {
  const net = { $max: [0, { $subtract: [credits, refundValue(invoiceKey)] }] };
  return repository.updateOne({ _id: userId, billingCreditsApplied: { $ne: invoiceKey } }, [{ $set: {
    credits: { $add: [{ $ifNull: ['$credits', 100] }, { $max: [0, { $subtract: [net, { $ifNull: ['$billingDebt', 0] }] }] }] },
    billingDebt: { $max: [0, { $subtract: [{ $ifNull: ['$billingDebt', 0] }, net] }] },
    billingCreditsApplied: { $concatArrays: [{ $ifNull: ['$billingCreditsApplied', []] }, [invoiceKey]] },
  } }], { updatePipeline: true });
}

export async function reverseInvoiceCredits({ userId, invoiceKey, credits }, repository = User) {
  const previous = refundValue(invoiceKey);
  const debit = { $cond: [{ $in: [invoiceKey, { $ifNull: ['$billingCreditsApplied', []] }] }, { $max: [0, { $subtract: [credits, previous] }] }, 0] };
  return repository.updateOne({ _id: userId, $expr: { $lt: [previous, credits] } }, [{ $set: {
    credits: { $max: [0, { $subtract: [{ $ifNull: ['$credits', 0] }, debit] }] },
    billingDebt: { $add: [{ $ifNull: ['$billingDebt', 0] }, { $max: [0, { $subtract: [debit, { $ifNull: ['$credits', 0] }] }] }] },
    billingRefunds: { $setField: { field: { $literal: invoiceKey }, input: { $ifNull: ['$billingRefunds', {}] }, value: credits } },
  } }], { updatePipeline: true });
}

function refundValue(invoiceKey) {
  return { $ifNull: [{ $getField: { field: { $literal: invoiceKey }, input: { $ifNull: ['$billingRefunds', {}] } } }, 0] };
}
