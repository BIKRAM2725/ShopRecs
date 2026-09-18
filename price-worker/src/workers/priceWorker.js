import { Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { checkProductPrice } from "../services/priceTracker.js";

const priceWorker = new Worker(
    "price-check",
    async (job) => {
        const { productId } = job.data;

        console.log(
            `Starting price check: ${productId}`
        );

        try {
            const result =
                await checkProductPrice(
                    productId
                );

            console.log(
                `Price check completed: ${productId}`
            );

            return result;
        } catch (error) {
            console.error(
                `Price check failed: ${productId}`,
                error.message
            );

            throw error;
        }
    },
    {
        connection: redisConnection,

        concurrency: 3,

        stalledInterval: 30000,
    }
);

// Job completed successfully

priceWorker.on(
    "completed",
    (job, result) => {
        console.log(
            `Job ${job.id} completed`
        );

        console.log(
            "Result:",
            result
        );
    }
);

// Job failed after all retry attempts
 
priceWorker.on(
    "failed",
    (job, error) => {
        console.error(
            `Job ${job?.id} failed after ${job?.attemptsMade} attempts:`,
            error.message
        );
    }
);


priceWorker.on(
    "error",
    (error) => {
        console.error(
            "Price worker error:",
            error.message
        );
    }
);


console.log(
    "Price worker started with concurrency: 3"
);

export default priceWorker;