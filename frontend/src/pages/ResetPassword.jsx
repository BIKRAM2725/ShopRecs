import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";

const ResetPassword = () => {
  const navigate = useNavigate();
  const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

  const [form, setForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);

  // Read email/otp that were previously stored by the forgot-password flow
  const email = localStorage.getItem("resetEmail");
  const otp = localStorage.getItem("resetOTP");

  useEffect(() => {
    // If the user somehow landed on this page without going through forgot-password -> verify
    if (!email || !otp) {
      toast.warning("Missing reset state. Please request OTP again.");
      navigate("/forgot-password");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInput = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.newPassword || !form.confirmPassword) {
      toast.warning("Please fill all fields");
      return;
    }

    if (form.newPassword.length < 6) {
      toast.warning("Password must be at least 6 characters");
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      toast.warning("Passwords do not match");
      return;
    }

    if (!otp || !email) {
      toast.error("OTP or email missing. Please verify again.");
      navigate("/forgot-password");
      return;
    }

    setLoading(true);

    try {
      // Send both `password` and `newPassword` to be tolerant to backend naming.
      // Backend UpdatePassword earlier expected `password`. Some frontends use `newPassword`.
      const payload = {
        email,
        otp,
        password: form.newPassword,
        newPassword: form.newPassword,
      };

      const res = await axios.post(`${API}/api/auth/update-password`, payload);

      // if backend uses { success: true } or 200 - treat as success
      if (res?.data?.success || res.status === 200) {
        toast.success("Password reset successful");
        // cleanup localStorage keys used for reset flow
        localStorage.removeItem("resetEmail");
        localStorage.removeItem("resetOTP");
        // optionally remove any temporary flags
        navigate("/login");
      } else {
        // backend returned but with no success flag
        toast.error(res?.data?.error || res?.data?.message || "Reset failed");
      }
    } catch (err) {
      console.error("Reset password error:", err.response?.data || err.message);
      // Prefer the more descriptive server message if present
      toast.error(err.response?.data?.error || err.response?.data?.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-md">
        <h2 className="text-2xl font-semibold text-center mb-6">Reset Password</h2>

        {/* show the email being used for reset so user knows which account */}
        {email && (
          <p className="text-sm text-gray-600 mb-4 text-center">
            Resetting password for <strong>{email}</strong>
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label>New Password:</label>
            <input
              type="password"
              name="newPassword"
              value={form.newPassword}
              onChange={handleInput}
              placeholder="Enter new password"
              className="w-full border p-2 rounded mt-1"
            />
          </div>

          <div className="mb-4">
            <label>Confirm Password:</label>
            <input
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleInput}
              placeholder="Confirm password"
              className="w-full border p-2 rounded mt-1"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full p-2 rounded text-white ${
              loading ? "bg-gray-400 cursor-not-allowed" : "bg-indigo-500 hover:bg-indigo-600"
            }`}
          >
            {loading ? "Updating..." : "Reset Password"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;