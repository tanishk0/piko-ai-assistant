import User from "../models/user.model.js"

export const deductCredits = async ({ userId, credits, reservationId }) => {
    if (!userId) {
        throw new Error("User ID is required")
    }

    if (!Number.isInteger(credits) || credits <= 0) {
        throw new Error("Credits must be a positive number")
    }

    const user = await User.findOneAndUpdate({
        _id: userId,
        credits: { $gte: credits },
        billingDebt: { $not: { $gt: 0 } },
        ...(reservationId ? { creditReservations: { $ne: reservationId } } : {}),
    },
        {
            $inc: {
                credits: -credits
            },
            ...(reservationId ? { $addToSet: { creditReservations: reservationId } } : {}),
        },
        {
            returnDocument: "after",
            runValidators: true,
        }
    )

    if (!user) {
        const existUser = await User.exists({ _id: userId })
        if (!existUser) {
            throw new Error("User not found")
        }

        throw Object.assign(new Error("Insufficient available credits or an unsettled refund balance. Open Pricing & billing to review your balance."), { status: 402 })
    }
    return {
        success: true,
        creditsDeducted: credits,
        remainingCredits: user.credits,
    };
}

export async function refundCredits({ userId, credits, reservationId }) {
    await User.updateOne({ _id: userId, creditReservations: reservationId }, {
        $inc: { credits }, $pull: { creditReservations: reservationId },
    });
}

export async function settleCredits({ userId, reservationId }) {
    await User.updateOne({ _id: userId }, { $pull: { creditReservations: reservationId } });
}
