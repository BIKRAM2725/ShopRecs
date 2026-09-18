import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Profile - show full user id (no truncation)
 */
export default function Profile({ user: userProp }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  function safeParse(raw) {
    if (!raw) return null;
    try {
      if (typeof raw === "object") return raw;
      let parsed = JSON.parse(raw);
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  function normalize(raw) {
    if (!raw) return null;
    const r = raw.user || raw;
    return {
      id: r.id || r._id || r.userId || r.uid || null,
      name: r.name || r.fullName || r.username || r.displayName || "",
      email: r.email || r.mail || "",
      role: r.role || ""
    };
  }

  useEffect(() => {
    if (userProp) {
      setUser(normalize(userProp));
      return;
    }

    const raw = localStorage.getItem("user");
    const parsed = safeParse(raw);
    if (parsed) {
      setUser(normalize(parsed));
      return;
    }

    const name = localStorage.getItem("name");
    const email = localStorage.getItem("email");
    const id = localStorage.getItem("userId") || localStorage.getItem("id");
    if (name && email) setUser(normalize({ id, name, email }));
    else setUser(null);
  }, [userProp]);

  useEffect(() => {
    const onStorage = () => {
      const raw = localStorage.getItem("user");
      const parsed = safeParse(raw);
      if (parsed) {
        setUser(normalize(parsed));
        return;
      }
      const name = localStorage.getItem("name");
      const email = localStorage.getItem("email");
      const id = localStorage.getItem("userId") || localStorage.getItem("id");
      if (name && email) setUser(normalize({ id, name, email }));
      else setUser(null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("name");
    localStorage.removeItem("email");
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    window.dispatchEvent(new Event("storage"));
    navigate("/login");
  };

  const handleCopyEmail = async () => {
    if (!user?.email) return;
    try {
      await navigator.clipboard.writeText(user.email);
    } catch {}
  };

  if (!user) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <div className="text-gray-500">No profile available</div>
      </div>
    );
  }

  const initial = (user.name?.charAt(0) || "U").toUpperCase();
  // SHOW FULL ID (not truncated)
  const fullId = user.id || "—";

  return (
    <div className="flex justify-center items-center min-h-[300px] bg-gray-100 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6">
        <div className="flex flex-col items-center">
          <div className="w-24 h-24 rounded-full bg-indigo-500 flex items-center justify-center text-white text-4xl font-bold shadow-md">
            {initial}
          </div>
          <h2 className="mt-4 text-2xl font-semibold text-gray-800 truncate">
            {user.name || "Unnamed User"}
          </h2>
          <p className="text-gray-500 text-sm mt-1 truncate">{user.email}</p>
        </div>

        <div className="border-t my-4" />

        <div className="flex flex-col gap-3 text-sm text-gray-700">
          <div className="flex justify-between items-center">
            <span className="font-medium">User ID</span>
            <span className="text-gray-500 break-all max-w-[60%]">{fullId}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="font-medium">Email</span>
            <div className="flex items-center gap-3">
              <span className="text-gray-500 truncate max-w-[140px]">{user.email}</span>
              <button onClick={handleCopyEmail} className="text-indigo-600 hover:underline text-sm">
                Copy
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={handleSignOut} className="flex-1 py-2 rounded bg-red-500 text-white hover:bg-red-600 transition">
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}