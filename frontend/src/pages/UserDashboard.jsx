import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Profile from "./Profile"; 

const UserDashboard = () => {
  const navigate = useNavigate();
  const API = import.meta.env.VITE_API_URL;

  const [user, setUser] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`${API}/api/user-dashboard`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });

        setUser(res.data.user);

      } catch {
        navigate("/login");
      }
    };

    fetchData();
  }, []);

  return (
    <Profile user={user} />   // pass props
  );
};

export default UserDashboard;