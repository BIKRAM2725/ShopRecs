import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaChevronDown, FaTimes } from "react-icons/fa";
import { IoSearch } from "react-icons/io5";
import { VscAccount } from "react-icons/vsc";
import { CgShoppingCart } from "react-icons/cg";
import { MdOutlineTrackChanges } from "react-icons/md";
import { RiPriceTag3Line } from "react-icons/ri";
import logo from "../assets/image2.png";

export default function Header() {
  const [toggle, setToggle] = useState(false);
  const navigate = useNavigate();

  // token and name from localStorage
  const token = localStorage.getItem("token");
  const userName = localStorage.getItem("name") || "";

  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "";

  // show logout item in sidebar only when on a dashboard page
  const showLogoutInSidebar = token && pathname.includes("dashboard");

  const menuItems = [
    { key: "track", name: "Track Product", icon: <MdOutlineTrackChanges />, disabled: true },
    { key: "pricedrops", name: "Price Drops", icon: <RiPriceTag3Line />, top: "Hot", badge: true, disabled: true },
    { key: "wishlist", name: "Wishlist", icon: <CgShoppingCart />, disabled: true },
    { key: "search", name: "Search", icon: <IoSearch /> },
    { key: "profile", name: "Profile", icon: <VscAccount /> },
  ];

  // ✅ UPDATED HANDLER
  const handleMenuClick = (item) => {
    if (item.disabled) return;

    // PROFILE
    if (item.key === "profile") {
      if (token) navigate("/profile");
      else navigate("/login");
      setToggle(false);
      return;
    }

    // 🔥 SEARCH → HOME
    if (item.key === "search") {
      navigate("/");
      setToggle(false);
      return;
    }

    // (future routes if you enable them)
    if (item.key === "track") navigate("/track");
    if (item.key === "pricedrops") navigate("/price-drops");
    if (item.key === "wishlist") navigate("/wishlist");

    setToggle(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("name");
    navigate("/login");
  };

  return (
    <>
      {/* OVERLAY */}
      <div
        onClick={() => setToggle(false)}
        className={`fixed w-full h-full bg-black/50 z-40 transition-all duration-500 ${
          toggle ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
      >
        {/* SIDEBAR */}
        <div
          onClick={(e) => e.stopPropagation()}
          className={`bg-white w-[320px] h-full absolute top-0 transition-all duration-500 p-5 ${
            toggle ? "left-0" : "-left-[100%]"
          }`}
        >
          {/* TOP */}
          <div className="flex items-center justify-between border-b pb-4">
            <div className="flex items-center gap-3">
              <img src={logo} alt="logo" className="w-[60px]" />
              {token && (
                <div className="text-sm font-medium">
                  Hi, {userName || "User"}
                </div>
              )}
            </div>
            <FaTimes
              className="text-2xl cursor-pointer text-gray-600"
              onClick={() => setToggle(false)}
            />
          </div>

          {/* MENU */}
          <div className="mt-8 flex flex-col gap-6">
            {menuItems.map((item, index) => (
              <div
                key={index}
                title={item.disabled ? "Available soon" : item.name}
                onClick={() => handleMenuClick(item)}
                className={`relative flex items-center gap-4 text-[18px] font-medium transition-all ${
                  item.disabled
                    ? "opacity-60 cursor-not-allowed select-none"
                    : "hover:text-green-700 cursor-pointer"
                }`}
              >
                <span className="text-2xl relative">
                  {item.icon}
                  {item.badge && (
                    <span className="absolute -top-1 -right-2 w-3 h-3 rounded-full bg-red-600 ring-2 ring-white" />
                  )}
                </span>
                <span>{item.name}</span>
                {item.top && (
                  <sup className="text-green-600 font-bold ml-1">
                    {item.top}
                  </sup>
                )}
              </div>
            ))}

            {/* LOGOUT (only on dashboard pages) */}
            {showLogoutInSidebar && (
              <div
                onClick={handleLogout}
                className="mt-3 text-red-600 font-semibold cursor-pointer flex items-center gap-3"
              >
                <div className="w-3 h-3 rounded-full bg-red-600" />
                <span>Logout</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-white shadow-md">
        <div className="max-w-[1200px] mx-auto flex items-center gap-8 px-4 py-3">
          {/* LOGO */}
          <div className="w-[90px]">
            <img src={logo} alt="logo" className="w-full" />
          </div>

          {/* DASHBOARD DROPDOWN */}
          <div
            onClick={() => setToggle(true)}
            className="flex items-center gap-2 cursor-pointer hover:text-green-700 transition-all"
          >
            <span className="font-bold border-b-2 border-black">
              Dashboard
            </span>
            <FaChevronDown className="text-green-700" />
          </div>

          {/* DESKTOP NAV */}
          <nav className="hidden md:flex gap-8 ml-auto items-center">
            {menuItems.map((item, idx) => (
              <div
                key={idx}
                title={item.disabled ? "Available soon" : item.name}
                onClick={() => handleMenuClick(item)}
                className={`relative flex items-center gap-2 font-medium transition-all ${
                  item.disabled
                    ? "opacity-60 cursor-not-allowed select-none"
                    : "hover:text-green-700 cursor-pointer"
                }`}
              >
                <span className="text-xl relative">{item.icon}</span>
                <span>{item.name}</span>
                {item.top && (
                  <sup className="text-green-600 font-bold ml-1">
                    {item.top}
                  </sup>
                )}
              </div>
            ))}
          </nav>
        </div>
      </header>
    </>
  );
}