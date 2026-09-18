import bcrypt from 'bcrypt';
import JWT from 'jsonwebtoken';
import { sendOTPEmail } from "../config/mail.js";
import User from "../models/User.js";

export const Register = async (req, res)=>{
    
    try
    {
        const { name, email, password } = req.body;

        if(!name || !email || !password)
        {
            return res.status(400).json ({
                error: "Please Fill all the details"
            })
        }

        const user = await User.findOne({email});

        if(user)
        {
            return res.status(400).json ({
                error: "You are already registered please login"
            })
        }

        // const salt = await bcrypt.genSalt(10);

        const hashPassword = await bcrypt.hash(password,10);

        // const newUser = await User({
        //     name,
        //     email,
        //     password
        // }).save();

        const newUser = await User.create({
            name,
            email,
            password : hashPassword
        });

        return res.status(201).json({
            success: true,
            message: "User Successfully created"
        })
    }
    
    catch(error)
    {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Fail  to create new user"
        })

    }
}


export const Login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Please fill all the information",
      });
    }

    const validUser = await User.findOne({ email });
    if (!validUser) {
      return res.status(400).json({
        success: false,
        error: "Please register first",
      });
    }

    const validPassword = await bcrypt.compare(password, validUser.password);
    if (!validPassword) {
      return res.status(400).json({
        success: false,
        error: "Please provide a valid password",
      });
    }

    // include role in token payload if you want role-based protected routes
    const token = JWT.sign(
      {
        id: validUser._id,
        role: validUser.role ?? "user", // default role if not set
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Return token + user public info (no password)
    return res.status(200).json({
      success: true,
      message: "Login Successful",
      token,
      user: {
        id: validUser._id,
        name: validUser.name,
        email: validUser.email,
        role: validUser.role ?? "user",
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Fail to login",
    });
  }
};

export const ForgetPassword = async (req,res) => {

    try{

        const { email } = req.body;

        if(!email )
        {
            return res.status(400).json({
                error:"Please enter email"
            })
        }

        const checkUser = await User.findOne({email});

        if(!checkUser)
        {
            return res.status(400).json({
                error:"Sorry User non found"
            })
        }
        
        const otp = Math.floor(
            100000 + Math.random() * 900000
        ).toString();

        const otpExpiry = Date.now() + 10 * 60 * 1000;

        checkUser.otp = otp;

        checkUser.otpExpiry = otpExpiry;

        await checkUser.save();

        await sendOTPEmail(email, otp);


        return res.status(200).json({
            success: true,
            message: "OTP send successfully",
            otp: otp  
    });

    }
    catch(error)
    {
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Something went wrong"
        });

    }
}

export const VerifyOTP = async (req,res) => {

    try{

        const { email, otp } = req.body;

        if(!email || !otp)
        {
            return res.status(400).json({
                error:"Please fill all the details"
            })

        }

        const validUser = await User.findOne({email});

        if(!validUser )
        {
            return res.status(400).json({
                error:"User not found"
            })
        }

        if( Date.now() > validUser.otpExpiry )
        {
            return res.status(400).json({
            error: "OTP Expired"
            });
        }

        if(otp !== validUser.otp)
        {
            return res.status(400).json({
                error:"Invalid OTP"
            })
        }

        return res.status(200).json({
            success: true,
            message: "OTP verify successfully",
    });

    }
    catch(error){
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Something went wrong"
        });

    }
}

export const UpdatePassword = async (req, res) => {
  try {
    // accept either "password" or "newPassword" from the client:
    const { email, otp } = req.body;
    const password = req.body.password || req.body.newPassword;

    if (!email || !otp || !password) {
      return res.status(400).json({ error: "Please fill all the details" });
    }

    const updatedUser = await User.findOne({ email });
    if (!updatedUser) return res.status(400).json({ error: "User not found" });

    if (updatedUser.otp !== otp) return res.status(400).json({ error: "Invalid Otp" });

    if (Date.now() > updatedUser.otpExpiry) return res.status(400).json({ error: "Otp expired " });

    updatedUser.password = await bcrypt.hash(password, 10);
    updatedUser.otp = null;
    updatedUser.otpExpiry = null;
    await updatedUser.save();

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
}