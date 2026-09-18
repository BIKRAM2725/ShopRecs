import TrackedProduct from "../models/Product.js";
import axios from "axios";
import { scrapeProduct } from "../services/scrapers/productScraper.js";

export const createProduct = async (req, res) => {
    try {
        const { source, url } = req.body;

        // Validate request
        if (!source || !url) {
            return res.status(400).json({
                success: false,
                message: "Source and URL are required",
            });
        }

        // Get the latest product information
        const productData = await scrapeProduct(
            source,
            url
        );

        if (!productData) {
            return res.status(400).json({
                success: false,
                message: "Failed to scrape product",
            });
        }

        // Check if this product is already being tracked
        const existingProduct =
            await TrackedProduct.findOne({
                source: productData.source,
                productKey: productData.productKey,
            });

        // New product

        if (!existingProduct) {
            const product =
                await TrackedProduct.create({
                    ...productData,

                    // Store the first price in history
                    history: [
                        {
                            price:
                                productData.currentPrice,
                            checkedAt: new Date(),
                        },
                    ],
                });

            return res.status(201).json({
                success: true,
                message:
                    "Product created successfully",
                product,
            });
        }

        // Existing product

        const oldPrice =
            existingProduct.currentPrice;

        const newPrice =
            productData.currentPrice;

        // Check whether the price actually changed
        const priceChanged =
            oldPrice !== newPrice;


        if (priceChanged) {
            existingProduct.history.unshift({
                price: newPrice,
                checkedAt: new Date(),
            });
        }

        // Update current product information
        existingProduct.currentPrice =
            newPrice;

        existingProduct.mrp =
            productData.mrp;

        existingProduct.inStock =
            productData.inStock;

        existingProduct.lastChecked =
            new Date();

        // Update product details
        existingProduct.title =
            productData.title;

        existingProduct.brand =
            productData.brand;

        existingProduct.category =
            productData.category;

        existingProduct.modelNumber =
            productData.modelNumber;

        existingProduct.image =
            productData.image;

        existingProduct.specifications =
            productData.specifications;

        await existingProduct.save();

        return res.status(200).json({
            success: true,

            message: priceChanged
                ? "Product price updated"
                : "Product checked successfully",

            priceChanged,

            oldPrice,

            newPrice,

            product: existingProduct,
        });
    } catch (error) {
        console.error(
            "Create product error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to create product",
        });
    }
};
export const getProducts = async (req, res) => {
    try {
        const products = await TrackedProduct.find()
            .sort({ updatedAt: -1 });

        res.status(200).json({
            success: true,
            totalProducts: products.length,
            products,
        });
    } catch (error) {
        console.error("Get products error:", error.message);

        res.status(500).json({
            success: false,
            message: "Failed to fetch products",
        });
    }
};

export const getSingleProduct = async (req, res) => {
    try {
        const product = await TrackedProduct.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        res.status(200).json({
            success: true,
            product,
        });
    } catch (error) {
        console.error("Get product error:", error.message);

        res.status(500).json({
            success: false,
            message: "Failed to fetch product",
        });
    }
};

export const searchProducts = async (req, res) => {
    try {
        const { keyword } = req.params;

        if (!keyword) {
            return res.status(400).json({
                success: false,
                message: "Search keyword is required",
            });
        }

        // Escape special RegExp characters
        const safeKeyword = keyword.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

        const searchRegex = new RegExp(safeKeyword, "i");

        const products = await TrackedProduct.find({
            $or: [
                { title: searchRegex },
                { brand: searchRegex },
                { category: searchRegex },
                { modelNumber: searchRegex },
            ],
        }).sort({ updatedAt: -1 });

        res.status(200).json({
            success: true,
            totalProducts: products.length,
            products,
        });
    } catch (error) {
        console.error("Search products error:", error.message);

        res.status(500).json({
            success: false,
            message: "Failed to search products",
        });
    }
};

export const similarProducts = async (req, res) => {
    try {
        const product = await TrackedProduct.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        // Only consider products within ±25% price range
        const minPrice = product.currentPrice * 0.75;
        const maxPrice = product.currentPrice * 1.25;

        const candidates = await TrackedProduct.find({
            // Don't compare product with itself
            _id: { $ne: product._id },

            // Must be from another platform
            source: { $ne: product.source },

            // Same category
            category: product.category,

            // Similar price range
            currentPrice: {
                $gte: minPrice,
                $lte: maxPrice,
            },
        });

        const similarProducts = candidates
            .map((candidate) => {
                let score = 0;

                // Brand match = 30 points
                if (
                    product.brand &&
                    candidate.brand &&
                    product.brand.toLowerCase() ===
                        candidate.brand.toLowerCase()
                ) {
                    score += 30;
                }

                // Model number match = 40 points
                if (
                    product.modelNumber &&
                    candidate.modelNumber &&
                    product.modelNumber.toLowerCase() ===
                        candidate.modelNumber.toLowerCase()
                ) {
                    score += 40;
                }

                // Specification match = 10 points each
                if (
                    product.specifications &&
                    candidate.specifications
                ) {
                    for (const [key, value] of product.specifications) {
                        if (
                            candidate.specifications.get(key) === value
                        ) {
                            score += 10;
                        }
                    }
                }

                // Price similarity = maximum 20 points
                if (product.currentPrice > 0) {
                    const priceDifference = Math.abs(
                        product.currentPrice -
                            candidate.currentPrice
                    );

                    const priceScore = Math.max(
                        0,
                        20 -
                            (priceDifference /
                                product.currentPrice) *
                                20
                    );

                    score += priceScore;
                }

                return {
                    ...candidate.toObject(),
                    similarityScore: Math.round(score),
                };
            })

            // Remove weak matches
            .filter(
                (product) => product.similarityScore >= 50
            )

            // Highest score first
            .sort(
                (a, b) =>
                    b.similarityScore -
                    a.similarityScore
            );

        res.status(200).json({
            success: true,
            totalProducts: similarProducts.length,
            products: similarProducts,
        });
    } catch (error) {
        console.error(
            "Similar products error:",
            error.message
        );

        res.status(500).json({
            success: false,
            message: "Failed to find similar products",
        });
    }
};

export const getPriceHistory = async (req, res) => {
    try {
        const product =
            await TrackedProduct.findById(
                req.params.id
            ).select(
                "currentPrice mrp history"
            );

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        return res.status(200).json({
            success: true,

            productId: product._id,

            currentPrice:
                product.currentPrice,

            mrp: product.mrp,

            history: product.history,
        });
    } catch (error) {
        console.error(
            "Get price history error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch price history",
        });
    }
};

const FASTAPI_URL =
    process.env.FASTAPI_URL ||
    "http://127.0.0.1:8000/predict";

export const predictProduct = async (req, res) => {
    try {
        const { id } = req.params;



        const product = await TrackedProduct
            .findById(id)
            .lean();

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }


        const payload = {
            product: {
                currentPrice: product.currentPrice ?? null,
                mrp: product.mrp ?? null,
                rating: product.rating ?? null,
                reviewCount: product.reviewCount ?? null,
                category: product.category ?? null,
                source: product.source ?? null,

                // Send only price from history
                history: Array.isArray(product.history)
                    ? product.history.map((item) => ({
                          price: item.price ?? null,
                      }))
                    : [],
            },
        };



        const axiosConfig = {
            timeout: 20000,
            headers: {
                "Content-Type": "application/json",
            },
        };

        let fastResp;

        try {
            fastResp = await axios.post(
                FASTAPI_URL,
                payload,
                axiosConfig
            );
        } catch (err) {
            // FastAPI responded with an error
            if (err.response) {
                return res.status(502).json({
                    success: false,
                    message: "FastAPI returned an error",
                    fastapiStatus: err.response.status,
                    fastapiData: err.response.data,
                });
            }

            // FastAPI could not be reached
            return res.status(502).json({
                success: false,
                message: `Could not reach FastAPI at ${FASTAPI_URL}: ${err.message}`,
            });
        }

    

        return res.status(200).json({
            success: true,
            productId: product._id,
            ai: fastResp.data,
        });
    } catch (error) {
        console.error(
            "predictProduct error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};
