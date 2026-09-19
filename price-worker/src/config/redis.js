// import IORedis from "ioredis";

// export const redisConnection = new IORedis({
//     host: process.env.REDIS_HOST || "localhost",
//     port: Number(process.env.REDIS_PORT) || 6379,

//     maxRetriesPerRequest: null,
// });

// redisConnection.on("connect", () => {
//     console.log("Redis connected");
// });

// redisConnection.on("error", (error) => {
//     console.error(
//         "Redis connection error:",
//         error.message
//     );
// });




import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL || process.env.REDIS_URI || null;

const commonOpts = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  connectTimeout: 10000,
  // small retry strategy
  retryStrategy(times) {
    return Math.min(50 * times, 2000);
  },

  keepAlive: 0
};

let _redis;

if (redisUrl) {

  _redis = new IORedis(redisUrl, {
    ...commonOpts,

  });
} else {

  _redis = new IORedis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === "true" ? {} : undefined,
    ...commonOpts
  });
}

_redis.on("connect", () => {
  console.log("Redis connected");
});

_redis.on("ready", () => {
  console.log("Redis ready");
});

_redis.on("error", (err) => {
  console.error("Redis connection error:", err && err.message ? err.message : err);
});

_redis.on("end", () => {
  console.warn("Redis connection closed");
});

export const redisConnection = _redis;
export default redisConnection;
