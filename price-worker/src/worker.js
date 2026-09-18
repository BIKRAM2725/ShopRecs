import "dotenv/config";

import { connectDB } from "./config/db.js";
import { redisConnection } from "./config/redis.js";

import "./workers/priceWorker.js";

import { startPriceScheduler } from "./scheduler/priceScheduler.js";

const startWorker = async () => {
    try {
        await connectDB();

        await redisConnection.ping();

        console.log(
            "Redis connection verified"
        );

        startPriceScheduler();

        console.log(
            "Price worker started successfully"
        );
    } catch (error) {
        console.error(
            "Worker startup error:",
            error.message
        );

        process.exit(1);
    }
};

startWorker();