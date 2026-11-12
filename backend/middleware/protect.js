import jwt from "jsonwebtoken"
import User from "../models/user.model.js"

const protect = async(req, res, next)=> {
    try {
        const token=res.cookies.token
        if(!token){
            return res.status(404).json({
                message: "Unauthorized access",
            })
        }
        const decoded=jwt.verify(token, process.env.JWT_SECRET)
        const user=await User.findById(decoded.userId)
        if(!user){
            return res.status(404).json({message: "User not found"})
        }
        req.user=user
        next()
    } catch (error) {
        return res.status(500).json({message: "Error"})
    }
}

export default protect