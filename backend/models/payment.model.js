import mongoose from 'mongoose';

// One receipt per recurring invoice, shared by checkout verification and webhooks.
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  keyId: { type: String, required: true },
  plan: { type: String, enum: ['pro', 'team'], required: true },
  credits: { type: Number, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true },
  razorpaySubscriptionId: { type: String, required: true },
  razorpayInvoiceId: { type: String, required: true },
  razorpayOrderId: String,
  razorpayPaymentId: { type: String, required: true },
  status: { type: String, enum: ['captured', 'credited', 'partially_refunded', 'refunded'], default: 'captured' },
  receiptUrl: String,
  paidAt: Date,
}, { timestamps: true });
schema.index({ keyId: 1, razorpayInvoiceId: 1 }, { unique: true });
schema.index({ keyId: 1, razorpayPaymentId: 1 }, { unique: true });
export default mongoose.model('Payment', schema);
