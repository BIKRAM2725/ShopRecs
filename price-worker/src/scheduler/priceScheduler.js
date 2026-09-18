import cron from "node-cron";

import { priceQueue } from "../queues/priceQueue.js";
import { enqueuePriceChecks } from "../jobs/enqueuePriceChecks.js";
import { redisConnection } from "../config/redis.js";

const SCHEDULER_LOCK_KEY =
    "price-worker:scheduler-lock";

const LOCK_TTL = 60; // seconds


const isPreviousCycleRunning =
    async () => {

        const counts =
            await priceQueue.getJobCounts(
                "waiting",
                "active",
                "delayed",
                "prioritized",
                "waiting-children"
            );

        const pendingJobs =
            counts.waiting +
            counts.active +
            counts.delayed +
            counts.prioritized +
            counts["waiting-children"];

        console.log(
            "Price queue status:",
            counts
        );

        return pendingJobs > 0;
    };


const runPriceCheckCycle =
    async () => {

        try {

            // Prevent multiple scheduler instances
            const lockAcquired =
                await redisConnection.set(
                    SCHEDULER_LOCK_KEY,
                    Date.now().toString(),
                    "EX",
                    LOCK_TTL,
                    "NX"
                );

            if (!lockAcquired) {

                console.log(
                    "Another scheduler instance is already running. Skipping."
                );

                return;
            }


            // Wait for previous cycle to finish
            const cycleRunning =
                await isPreviousCycleRunning();

            if (cycleRunning) {

                console.log(
                    "Previous price-check cycle is still running."
                );

                console.log(
                    "New cycle skipped. Waiting for current cycle to finish."
                );

                return;
            }


            console.log(
                "Starting scheduled price check..."
            );


            await enqueuePriceChecks();


            console.log(
                "Scheduled price check completed"
            );

        } catch (error) {

            console.error(
                "Price scheduler error:",
                error.message
            );

        } finally {

            try {

                await redisConnection.del(
                    SCHEDULER_LOCK_KEY
                );

            } catch (error) {

                console.error(
                    "Failed to release scheduler lock:",
                    error.message
                );
            }
        }
    };


export const startPriceScheduler =
    () => {

        cron.schedule(
            "0 */6 * * *",
            runPriceCheckCycle
        );

        console.log(
            "Price scheduler started — every 6 hours"
        );
    };