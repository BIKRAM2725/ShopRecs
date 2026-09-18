import React, { useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";

const ForgotVerifyOTP = () => {
  const navigate = useNavigate();
  const API = import.meta.env.VITE_API_URL;

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const email = localStorage.getItem("resetEmail");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!otp.trim()) {
      toast.warning("Enter OTP");
      return;
    }

    if (otp.length !== 6) {
      toast.warning("OTP must be 6 digits");
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${API}/api/auth/verify-otp`, {
        email,
        otp
      });

      toast.success("OTP verified");

      // 🔥 STORE OTP for next step
      localStorage.setItem("resetOTP", otp);

      // 🔥 navigate to reset password
      navigate("/reset-password");

    } catch (err) {
      toast.error(err.response?.data?.error || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  // optional safety check
  if (!email) {
    navigate("/forgot-password");
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-md">

        <h2 className="text-2xl font-semibold text-center mb-6">
          Verify OTP
        </h2>

        <form onSubmit={handleSubmit}>

          <div className="mb-4">
            <label className="font-medium">Enter OTP:</label>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="6 digit OTP"
              className="w-full border p-2 rounded mt-1 outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full p-2 rounded text-white ${
              loading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-indigo-500 hover:bg-indigo-600"
            }`}
          >
            {loading ? "Verifying..." : "Verify OTP"}
          </button>

        </form>

      </div>
    </div>
  );
};

export default ForgotVerifyOTP;