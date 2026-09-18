// import React, { useState } from "react";
// import axios from "axios";
// import { toast } from "react-toastify";
// import { useNavigate } from "react-router-dom";

// const Register = () => {
//   const navigate = useNavigate();

//   const API = import.meta.env.VITE_API_URL;

//   const [loading, setLoading] = useState(false);

//   const [login, setLogin] = useState({
//     name: "",
//     email: "",
//     password: "",
//   });

//   const handleInput = (e) => {
//     setLogin({ ...login, [e.target.name]: e.target.value });
//   };

//   const handleSubmit = async (e) => {
//     e.preventDefault();


//     if (!login.name.trim() || !login.password.trim() || !login.email.trim()) {
//       toast.warning("Please fill all inputs ");
//       return;
//     }

//     if (!login.email.includes("@")) {
//       toast.warning("Please provide a valid email");
//       return;
//     }

//     if (login.password.length < 6) {
//       toast.warning("Password must be at least 6 digits");
//       return;
//     }

//        setLoading(true);

//     try {
//       await axios.post(`${API}/api/auth/register`, login);

//       setLogin({
//         name: "",
//         email: "",
//         password: "",
//       });

//       toast.success("Register successfully");

//       navigate("/login");

//       return;
//     } catch (error) {
//       if (error.response && error.response.data.error) {
//         toast.error(error.response.data.error);
//         return;
//       } else {
//         toast.error("Something went wrong");
//         return;
//       }
//     }
//     finally
//     {
//         setLoading(false);
//     }
//   };

//   return (
//     <>
//       <div className="flex items-center justify-center bg-gray-100 pt-10 pb-10 ">
//         <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-md ">
//           <h2 className="font-semibold text-center text-2xl mb-6">Register</h2>
//           <form onSubmit={handleSubmit}>
//             <div className="mb-4 ">
//               <label className="font-semibold text-slate-700 ">Name:</label>

//               <input
//                 type="text"
//                 placeholder="Name"
//                 name="name"
//                 value={login.name}
//                 onChange={handleInput}
//                 className=" border border-slate-300 w-full rounded-md shadow-md h-[40px] pl-4 outline-none focus:border-indigo-500 focus:shadow-xl duration-200 "
//               />
//             </div>
//             <div className="mb-4 ">
//               <label className="font-semibold text-slate-700 ">Email:</label>

//               <input
//                 type="email"
//                 placeholder="Email"
//                 name="email"
//                 value={login.email}
//                 onChange={handleInput}
//                 className=" border border-slate-300 w-full rounded-md shadow-md h-[40px] pl-4 outline-none focus:border-indigo-500 focus:shadow-xl duration-200 "
//               />
//             </div>
//             <div className="mb-4 ">
//               <label className="font-semibold text-slate-700 ">Password:</label>

//               <input
//                 type="password"
//                 placeholder="Password"
//                 name="password"
//                 value={login.password}
//                 onChange={handleInput}
//                 className=" border border-slate-300 w-full rounded-md shadow-md h-[40px] pl-4 outline-none focus:border-indigo-500 focus:shadow-xl duration-200 "
//               />
//             </div>

//             <div>
//               {/* <button type='submit' onClick={} className='w-full bg-indigo-500 h-[40px] rounded-lg mt-8 text-white text-xl hover:bg-indigo-600 duration-300  hover:shadow-xl ' >Register</button> */}

//               <button
//                 type="submit"
//                 disabled={loading}
//                 className={`w-full h-[40px] rounded-lg mt-8 text-white text-xl 
//                     ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-indigo-500 hover:bg-indigo-600"}
                    
//                     `}
//                      >
//                 {loading ? "Registering..." : "Register"}
//               </button>
//             </div>
//             <div>
//               <h2 className="text-center mt-3">
//                 Already have account ?{" "}
//                 <a href="/login" className="text-indigo-500">
//                   Sign In
//                 </a>
//               </h2>
//             </div>
//           </form>
//         </div>
//       </div>
//     </>
//   );
// };

// export default Register;



import React, { useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";

const Register = () => {
  const navigate = useNavigate();
  const API = import.meta.env.VITE_API_URL;

  const [loading, setLoading] = useState(false);

  const [login, setLogin] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);

  const handleInput = (e) => {
    setLogin({ ...login, [e.target.name]: e.target.value });
  };

  // Send OTP
  const handleSendOTP = async () => {
    if (!login.email.includes("@")) {
      toast.warning("Enter valid email");
      return;
    }

    try {
      await axios.post(`${API}/api/auth/send-otp`, {
        email: login.email,
      });

      setOtpSent(true);
      toast.success("OTP sent to email");

    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to send OTP");
    }
  };

  // Verify OTP
  const handleVerifyOTP = async () => {
    try {
      await axios.post(`${API}/api/auth/verify-otp`, {
        email: login.email,
        otp,
      });

      setOtpVerified(true);
      toast.success("OTP verified");
    } catch (err) {
      toast.error(err.response?.data?.error || "Invalid OTP");
    }
  };

  // Register
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!otpVerified) {
      toast.warning("Verify OTP first");
      return;
    }

    if (!login.name || !login.password) {
      toast.warning("Fill all fields");
      return;
    }

    if (login.password.length < 6) {
      toast.warning("Password must be at least 6 digits");
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${API}/api/auth/register`, login);

      toast.success("Register successful");

      navigate("/login");

    } catch (error) {

      toast.error(error.response?.data?.error || "Register failed");

    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center bg-gray-100 pt-10 pb-10">
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-md">

        <h2 className="text-2xl text-center font-semibold mb-6">
          Register
        </h2>

        <form onSubmit={handleSubmit}>

          {/* Name */}
          <input
            type="text"
            name="name"
            placeholder="Name"
            value={login.name}
            onChange={handleInput}
            className="w-full border mb-3 p-2 rounded"
          />

          {/* Email */}
          <div className="flex gap-2 mb-3">
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={login.email}
              onChange={handleInput}
              className="w-full border p-2 rounded"
            />

            <button
              type="button"
              onClick={handleSendOTP}
              className="bg-blue-500 text-white px-3 rounded"
            >
              Send OTP
            </button>
          </div>

          {/* OTP */}
          {otpSent && (
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="Enter OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full border p-2 rounded"
              />

              <button
                type="button"
                onClick={handleVerifyOTP}
                className="bg-green-500 text-white px-3 rounded"
              >
                Verify
              </button>
            </div>
          )}

          {/* Password */}
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={login.password}
            onChange={handleInput}
            className="w-full border mb-4 p-2 rounded"
          />

          {/* Register Button */}
          <button
            type="submit"
            disabled={!otpVerified || loading}
            className={`w-full p-2 rounded text-white ${
              !otpVerified ? "bg-gray-400 cursor-not-allowed" : "bg-indigo-500 hover:bg-indigo-600"
            }`}
          >
            {loading ? "Registering..." : "Register"}
          </button>

          <p className="text-center mt-3">
            Already have account?{" "}
            <span
              onClick={() => navigate("/login")}
              className="text-indigo-500 cursor-pointer"
            >
              Login
            </span>
          </p>

        </form>
      </div>
    </div>
  );
};

export default Register;