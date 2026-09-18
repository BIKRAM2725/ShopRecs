import TrackedProduct from "../models/Product.js";
import { priceQueue } from "../queues/priceQueue.js";

export const enqueuePriceChecks = async () => {
    try {
        const products =
            await TrackedProduct.find(
                {},
                {
                    _id: 1,
                    source: 1,
                    productKey: 1,
                }
            ).lean();

        console.log(
            `Found ${products.length} products`
        );

        if (products.length === 0) {
            console.log(
                "No products available for price checking"
            );

            return;
        }

        /*
         * Prevent duplicate logical products
         * in the same scheduler cycle.
         *
         * Unique key:
         * source + productKey
         */
        const uniqueProducts = new Map();

        for (const product of products) {
            const key =
                `${product.source}:${product.productKey}`;

            if (!uniqueProducts.has(key)) {
                uniqueProducts.set(
                    key,
                    product
                );
            }
        }

        const productsToCheck =
            Array.from(
                uniqueProducts.values()
            );

        console.log(
            `Unique products to check: ${productsToCheck.length}`
        );

        /*
         * Create a unique ID for this
         * scheduler cycle.
         */
        const cycleId = Date.now();

        const jobs =
            productsToCheck.map(
                (product) => ({
                    name: "price-check",

                    data: {
                        productId:
                            product._id.toString(),
                    },

                    opts: {
                        /*
                         * Prevent duplicate job
                         * for the same product
                         * in the same cycle.
                         */
                        jobId:
                            `price-check-${product.source}-${product.productKey}-${cycleId}`,

                        /*
                         * Retry failed scraping
                         * up to 3 times.
                         */
                        attempts: 3,

                        /*
                         * Exponential retry delay:
                         *
                         * 5 sec
                         * 10 sec
                         * 20 sec
                         */
                        backoff: {
                            type: "exponential",
                            delay: 5000,
                        },

                        /*
                         * Remove successful jobs
                         * after completion.
                         */
                        removeOnComplete: true,

                        /*
                         * Remove failed jobs after
                         * all retry attempts are finished.
                         */
                        removeOnFail: true,
                    },
                })
            );

        await priceQueue.addBulk(jobs);

        console.log(
            `${jobs.length} unique price-check jobs added to queue`
        );
    } catch (error) {
        console.error(
            "Failed to enqueue price checks:",
            error.message
        );
    }
};