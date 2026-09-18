import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import { connectToDB } from "./src/config/db.js";
import authRoutes from "./src/routes/auth.js";
import productRoutes from "./src/routes/product.js";


dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

// Routes
app.use("/api/auth",authRoutes);
app.use("/api/products", productRoutes);


// Test route
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Price Tracker API is running",
    });
});

// Database
connectToDB();

// Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});