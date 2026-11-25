import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  requestId: { type: String, required: true },
  keyId: { type: String, required: true },
  plan: { type: String, enum: ['pro', 'team'], required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  credits: { type: Number, required: true },
  razorpayPlanId: String,
  razorpaySubscriptionId: String,
  status: { type: String, default: 'creating' },
  open: { type: Boolean, default: true },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  currentStart: Date,
  currentEnd: Date,
  nextChargeAt: Date,
  paidCount: { type: Number, default: 0 },
  lastSyncedAt: Date,
}, { timestamps: true });
schema.index({ userId: 1, keyId: 1 }, { unique: true, partialFilterExpression: { open: true } });
schema.index({ userId: 1, keyId: 1, requestId: 1 }, { unique: true });
schema.index({ keyId: 1, razorpaySubscriptionId: 1 }, { unique: true, partialFilterExpression: { razorpaySubscriptionId: { $type: 'string' } } });
export default mongoose.model('Subscription', schema);
