import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import amazon from "../assets/amazon.png";
import flipkart from "../assets/flipkart.png";
import myntra from "../assets/myntra.png";
import { IoSearch } from "react-icons/io5";

export default function HeroSection() {
  const navigate = useNavigate();
  const API = import.meta.env.VITE_API_URL; // make sure this is set in .env
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const detectSourceFromUrl = (u = "") => {
    const lowered = u.toLowerCase();
    if (lowered.includes("amazon.")) return "amazon";
    if (lowered.includes("flipkart.")) return "flipkart";
    if (lowered.includes("myntra.")) return "myntra";
    // fallback: if you prefer, return null and backend can try to infer
    return "other";
  };

  const handleTrack = async (e) => {
    e.preventDefault();

    if (!url?.trim()) {
      setMessage("Please enter product URL");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const source = detectSourceFromUrl(url);

      // POST to the backend create-product route (note: backend router mounts under /api/products)
      const { data } = await axios.post(`${API}/api/products`, {
        source,
        url,
      });

      // success message (controller returns message + product)
      setMessage(data.message || "Product tracked");

      // redirect to product details page (controller returns `product` in response)
      const productId = data.product?._id || data.product?.id;
      if (productId) {
        navigate(`/product/${productId}`);
      } else {
        // fallback: if product id not returned, just clear input and show message
        setUrl("");
      }
    } catch (error) {
      console.error(error);
      setMessage(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="w-full bg-gradient-to-b from-green-50 to-white py-16 overflow-hidden">
      <div className="max-w-[1200px] mx-auto px-4">
        {/* HERO CONTENT */}
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl font-bold leading-tight text-gray-800">
            Track Prices From
            <span className="text-green-700"> Amazon,</span>
            <span className="text-blue-600"> Flipkart</span> &amp;
            <span className="text-pink-600"> Myntra</span>
          </h1>
          <p className="mt-6 text-gray-600 text-lg max-w-[700px] mx-auto">
            Paste any product link and monitor real-time price drops, history,
            and best deals instantly.
          </p>
        </div>

        {/* INPUT SECTION */}
        <div className="max-w-[850px] mx-auto mt-10">
          <div className="bg-white shadow-xl rounded-2xl p-3 flex flex-col md:flex-row gap-4">
            <div className="flex items-center flex-1 bg-gray-100 rounded-xl px-4">
              <IoSearch className="text-2xl text-gray-500" />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste Amazon, Flipkart or Myntra product URL..."
                className="w-full bg-transparent outline-none px-3 py-4 text-[16px]"
              />
            </div>
            <button
              type="button"
              onClick={handleTrack}
              disabled={loading}
              className="bg-green-700 hover:bg-green-800 text-white px-8 py-4 rounded-xl font-semibold transition-all"
            >
              {loading ? "Tracking..." : "Track Price"}
            </button>
          </div>

          {/* MESSAGE */}
          {message && <p className="text-center mt-4 font-medium text-green-700">{message}</p>}
        </div>

        {/* MOVING LOGOS */}
        <div className="mt-16 overflow-hidden">
          <p className="text-center text-gray-500 font-medium mb-8">Supported Platforms</p>
          <div className="marquee-wrapper">
            <div className="marquee-track">
              {[...Array(4)].map((_, i) => (
                <div className="marquee-group" key={i}>
                  <img src={amazon} alt="amazon" className="h-14 object-contain" />
                  <img src={flipkart} alt="flipkart" className="h-14 object-contain" />
                  <img src={myntra} alt="myntra" className="h-14 object-contain" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}