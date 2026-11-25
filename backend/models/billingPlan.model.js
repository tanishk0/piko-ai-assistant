import mongoose from 'mongoose';
const schema = new mongoose.Schema({ _id: String, razorpayPlanId: { type: String, required: true } }, { timestamps: true });
export default mongoose.model('BillingPlan', schema);
