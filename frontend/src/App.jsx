// App.jsx
import React from "react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { Route, Routes, Navigate } from "react-router-dom";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import UserDashboard from "./pages/UserDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import ForgotPassword from "./pages/ForgotPassword";
import ForgotVerifyOTP from "./pages/ForgotVerifyOTP";
import ResetPassword from "./pages/ResetPassword";
import ProductDetails from "./pages/ProductDetails";
import Profile from "./pages/Profile";

function App() {
  return (
    <>
      <Header />
      <Routes>
        {/* HOME */}
        <Route path="/" element={<Home />} />

        {/* AUTH */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/forgot-verify-otp" element={<ForgotVerifyOTP />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* PRODUCT DETAILS */}
        <Route path="/product/:id" element={<ProductDetails />} />

        {/* PROFILE - protected for any authenticated user */}
        <Route
          path="/profile"
          element={
            /* no role prop => any authenticated user allowed */
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />

        {/* USER DASHBOARD (only for users with role "user") */}
        <Route
          path="/user-dashboard"
          element={
            <ProtectedRoute role="user">
              <UserDashboard />
            </ProtectedRoute>
          }
        />

        {/* ADMIN DASHBOARD (only for admins) */}
        <Route
          path="/admin-dashboard"
          element={
            <ProtectedRoute role="admin">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        {/* 404 / fallback - redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Footer />
    </>
  );
}

export default App;