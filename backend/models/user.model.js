import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    firebaseUid: {
        type: String,
        required: true,
        unique: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    profilePicture: {
        type: String,
        default: ""
    },
    creditReservations: { type: [String], default: [], select: false },
    billingCreditsApplied: { type: [String], default: [], select: false },
    billingRefunds: { type: Map, of: Number, default: {}, select: false },
    billingDebt: { type: Number, default: 0, min: 0 },
    credits:{
        type: Number,
        default: 100,
        min: 0,
    }
},{timestamps: true})

const User = mongoose.model("User", userSchema)

export default User
