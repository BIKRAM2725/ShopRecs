import React, { useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const API = import.meta.env.VITE_API_URL;

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.warning("Please enter email");
      return;
    }

    if (!email.includes("@")) {
      toast.warning("Enter valid email");
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${API}/api/auth/forgot_password`, { email });

      toast.success("OTP sent to your email");

      // store email for next step
      localStorage.setItem("resetEmail", email);

      navigate("/forgot-verify-otp");

    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-md">

        <h2 className="text-2xl font-semibold text-center mb-6">
          Forgot Password
        </h2>

        <form onSubmit={handleSubmit}>

          <div className="mb-4">
            <label>Email:</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full border p-2 rounded mt-1"
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
            {loading ? "Sending..." : "Send OTP"}
          </button>

        </form>

      </div>
    </div>
  );
};

export default ForgotPassword;