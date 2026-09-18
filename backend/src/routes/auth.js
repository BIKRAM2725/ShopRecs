import express from "express";

import {
    Register,
    Login,
    ForgetPassword,
    VerifyOTP,
    UpdatePassword
} from "../controllers/auth.js";

const router = express.Router();

router.post("/register",Register);

router.post("/login",Login);

router.post('/forgot_password', ForgetPassword);

router.post('/verify-otp',VerifyOTP);

router.post('/update-password',UpdatePassword)

export default router;