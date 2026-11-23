import { app } from "../config/firebase.js"
import { getAuth } from "firebase-admin/auth"
import User from "../models/user.model.js"
import jwt from "jsonwebtoken"

export const login = async (req, res) => {
    try {
        const { token: firebaseToken } = req.body
        if (!firebaseToken) {
            return res.status(400).json({
                message: "Token not found",
            })
        }

        const decoded = await getAuth(app).verifyIdToken(firebaseToken)

        const user = await User.findOneAndUpdate(
            {
                firebaseUid: decoded.uid
            },
            {
                $set: {
                    name: decoded.name,
                    email: decoded.email,
                    profilePicture: decoded.picture
                },
                $setOnInsert: {
                    firebaseUid: decoded.uid
                }
            },
            { upsert: true, returnDocument: "after" },
        )
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" })

        res.cookie("token", token, {
            httpOnly: true,

    }
    catch(error){
        return res.status(500).json({
            message: `login error: ${error}`
        })
    }
}

export const logout = async (req,res) => {
    try{ 
        res.clearCookie("token", {
            httpOnly: true,
            secure: false,
            sameSite: "strict"
        })
        return res.status(200).json({message: "Logout successfully"})
    }
    catch(error){
        return res.status(500).json({message: "Logout error"})
    }
}

export const me = async(req, res) => {
    try {
        const user=req.user
        return res.status(200).json(user)
    } catch (error) {
        return res.status(500).json({message: "Me error"})
    }
}










