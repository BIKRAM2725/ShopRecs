import express from "express";

import {
    createProduct,
    getProducts,
    getSingleProduct,
    searchProducts,
    similarProducts,
    getPriceHistory,
    predictProduct,
} from "../controllers/product.js";

const router = express.Router();

// Create product
router.post("/", createProduct);

// Get all products
router.get("/", getProducts);

// Search products
router.get("/search/:keyword", searchProducts);

// Similar products
router.get("/:id/similar", similarProducts);

// Price history
router.get("/:id/history", getPriceHistory);

// AI price prediction
router.post("/:id/predict", predictProduct);

// Get single product
router.get("/:id", getSingleProduct);

export default router;