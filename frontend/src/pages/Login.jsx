import React, { useState } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";

const Login = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const API = import.meta.env.VITE_API_URL;
  const [form, setForm] = useState({
    email: "",
    password: ""
  });

  const handleInput = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      toast.warning("Please Fill all the details");
      return;
    }
    if (!form.email.includes("@")) {
      toast.warning("Please provide a valid email");
      return;
    }
    if (form.password.length < 6) {
      toast.warning("Password must be at least 6 digits");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API}/api/auth/login`, form);

      // Save token and user data for Profile component + other parts of the app
      if (res?.data?.token) {
        localStorage.setItem("token", res.data.token);
      }
      // Save entire user object (Profile component attempts to read "user")
      if (res?.data?.user) {
        // ensure it's a plain object string
        localStorage.setItem("user", JSON.stringify(res.data.user));
        localStorage.setItem("role", res.data.user.role || "user");
        localStorage.setItem("name", res.data.user.name || "");
        localStorage.setItem("email", res.data.user.email || "");
        // keep both id keys just in case your profile expects userId or id
        const uid = res.data.user._id || res.data.user.id || "";
        if (uid) {
          localStorage.setItem("userId", uid);
          localStorage.setItem("id", uid);
        }
      }

      toast.success("Login Successful");

      // Redirect to profile page as requested
      navigate("/profile");
    } catch (err) {
      toast.error(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-center bg-gray-100 pt-10 pb-10 ">
        <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-md ">
          <h2 className="font-semibold text-center text-2xl mb-6">Sign In</h2>
          <form onSubmit={handleSubmit}>
            <div className="mb-4 ">
              <label className="font-semibold text-slate-700 ">Email:</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleInput}
                placeholder="Email"
                className=" border border-slate-300 w-full rounded-md shadow-md h-[40px] pl-4 outline-none focus:border-indigo-500 focus:shadow-xl duration-200 "
              />
            </div>

            <div className="mb-4 ">
              <label className="font-semibold text-slate-700 ">Password:</label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleInput}
                placeholder="Password"
                className=" border border-slate-300 w-full rounded-md shadow-md h-[40px] pl-4 outline-none focus:border-indigo-500 focus:shadow-xl duration-200 "
              />
            </div>

            <div className="flex justify-between mb-5 ">
              <span className="flex gap-3">
                <input type="checkbox" />
                <h2>Keep Sign In</h2>
              </span>
              <a href="/forgot-password" className="text-indigo-500">Forgot Password?</a>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className={`w-full p-2 rounded text-white ${
                  loading ? "bg-gray-400 cursor-not-allowed" : "bg-indigo-500 hover:bg-indigo-600"
                }`}
              >
                {loading ? "SignIn..." : "Sign In"}
              </button>
            </div>

            <div>
              <h2 className="text-center mt-3">No account ? <a href="/register " className="text-indigo-500">Register</a></h2>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default Login;