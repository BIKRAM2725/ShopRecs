import TrackedProduct from "../models/Product.js";
import { scrapeProduct } from "../scrapers/productScraper.js";

export const checkProductPrice = async (
    productId
) => {
    // 1. Get product from MongoDB
    const product =
        await TrackedProduct.findById(productId);

    if (!product) {
        throw new Error(
            `Product not found: ${productId}`
        );
    }

    console.log(
        `Checking ${product.source}: ${product.productKey}`
    );

    // 2. Scrape latest product data
    const latestProduct =
        await scrapeProduct(
            product.source,
            product.url
        );

    if (!latestProduct) {
        throw new Error(
            `Failed to scrape product: ${product.productKey}`
        );
    }

    const oldPrice =
        product.currentPrice;

    const newPrice =
        latestProduct.currentPrice;

    // 3. Validate scraped price
    if (
        typeof newPrice !== "number" ||
        !Number.isFinite(newPrice) ||
        newPrice < 0
    ) {
        throw new Error(
            `Invalid price received for ${product.productKey}`
        );
    }

    const priceChanged =
        oldPrice !== newPrice;

    // 4. Update price and history
    if (priceChanged) {
        product.history.unshift({
            price: newPrice,
            checkedAt: new Date(),
        });

        product.currentPrice =
            newPrice;

        console.log(
            `Price changed: ₹${oldPrice} → ₹${newPrice}`
        );
    } else {
        console.log(
            `Price unchanged: ₹${oldPrice}`
        );
    }

    // 5. Update latest product information
    product.inStock =
        latestProduct.inStock;

    product.title =
        latestProduct.title ||
        product.title;

    product.brand =
        latestProduct.brand ||
        product.brand;

    product.category =
        latestProduct.category ||
        product.category;

    product.modelNumber =
        latestProduct.modelNumber ||
        product.modelNumber;

    product.image =
        latestProduct.image ||
        product.image;

    product.specifications =
        latestProduct.specifications ||
        product.specifications;

    product.mrp =
        latestProduct.mrp;

    product.lastChecked =
        new Date();

    // 6. Save updated product
    await product.save();

    // 7. Return price-check result
    return {
        productId: product._id,

        source:
            product.source,

        productKey:
            product.productKey,

        oldPrice,
        newPrice,

        priceChanged,

        currentPrice:
            product.currentPrice,

        history:
            product.history,
    };
};