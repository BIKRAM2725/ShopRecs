import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const API = import.meta.env.VITE_API_URL;

  const [user, setUser] = useState(null);

  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        const res = await axios.get(`${API}/api/admin-dashboard`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });

        setUser(res.data.user);

      } catch {
        navigate("/login");
      }
    };

    fetchAdminData();
  }, []);

  return (
    <div>
      <h1>Admin Dashboard</h1>

      {user ? (
        <>
          <p><b>Name:</b> {user.name}</p>
          <p><b>Email:</b> {user.email}</p>
          <p><b>Role:</b> {user.role}</p>
        </>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
};

export default AdminDashboard;