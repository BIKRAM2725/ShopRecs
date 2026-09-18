import axios from "axios";
import * as cheerio from "cheerio";

import { normalizePrices } from "../../utils/priceUtils.js";

const safeNumber = (value) => {
    if (!value) return NaN;

    const number = Number(
        String(value).replace(/[₹,]/g, "").trim()
    );

    return Number.isFinite(number)
        ? number
        : NaN;
};

const extractProductKey = (url) => {
    try {
        const parsedUrl = new URL(url);
        const pid = parsedUrl.searchParams.get("pid");

        if (pid) {
            return pid;
        }
    } catch {
        // ignore invalid URL
    }

    const match = url.match(/\/p\/([^?]+)/i);

    return match ? match[1] : "";
};

export const scrapeFlipkart = async (url) => {
    try {
        const { data } = await axios.get(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
                "Accept-Language": "en-IN,en;q=0.9",
            },
            timeout: 10000,
        });

        const $ = cheerio.load(data);

        let title = "";
        let image = "";
        let currentPrice = NaN;
        let mrp = NaN;
        let inStock = true;

        // JSON-LD
        $('script[type="application/ld+json"]').each(
            (index, element) => {
                const raw = $(element)
                    .text()
                    .trim();

                if (!raw) {
                    return;
                }

                try {
                    const parsed = JSON.parse(raw);
                    const items = Array.isArray(parsed)
                        ? parsed
                        : [parsed];

                    for (const item of items) {
                        if (
                            !item ||
                            typeof item !== "object"
                        ) {
                            continue;
                        }

                        if (!title && item.name) {
                            title = String(item.name).trim();
                        }

                        if (!image && item.image) {
                            image = Array.isArray(item.image)
                                ? item.image[0]
                                : String(item.image);
                        }

                        if (
                            Number.isNaN(currentPrice) &&
                            item.offers?.price
                        ) {
                            currentPrice = safeNumber(
                                item.offers.price
                            );
                        }

                        if (
                            Number.isNaN(mrp) &&
                            item.offers?.highPrice
                        ) {
                            mrp = safeNumber(
                                item.offers.highPrice
                            );
                        }

                        if (item.offers?.availability) {
                            inStock = !String(
                                item.offers.availability
                            )
                                .toLowerCase()
                                .includes("outofstock");
                        }
                    }
                } catch {
                    // Ignore invalid JSON-LD
                }
            }
        );

        // Title fallback
        if (!title) {
            title = $("h1")
                .first()
                .text()
                .trim();
        }

        // Image fallback
        if (!image) {
            image =
                $("img")
                    .filter((index, element) => {
                        const src =
                            $(element).attr("src") || "";

                        return src.includes(
                            "rukminim2.flixcart.com/image/"
                        );
                    })
                    .first()
                    .attr("src") || "";
        }

        // Current price fallback
        if (Number.isNaN(currentPrice)) {
            const priceText =
                $("div.v1zwn21l.v1zwn20")
                    .first()
                    .text()
                    .trim() ||
                $(".Nx9bqj")
                    .first()
                    .text()
                    .trim() ||
                $("._30jeq3")
                    .first()
                    .text()
                    .trim();

            currentPrice = safeNumber(priceText);
        }

        // MRP fallback
        if (Number.isNaN(mrp)) {
            const mrpText =
                $("div.v1zwn21m.v1zwn21")
                    .first()
                    .text()
                    .trim() ||
                $(".yRaY8j")
                    .first()
                    .text()
                    .trim() ||
                $("._2rpwqI")
                    .first()
                    .text()
                    .trim();

            mrp = safeNumber(mrpText);
        }

        if (!title || Number.isNaN(currentPrice)) {
            return null;
        }

        // Brand
        let brand = "";

        if (title) {
            brand = title.split(" ")[0];
        }

        // Flipkart product key
        const productKey = extractProductKey(url);

        // These fields are not reliably available
        // in the current Axios HTML response.
        const category = "";
        const modelNumber = "";
        const specifications = {};

        // Stock fallback
        const bodyText = $("body")
            .text()
            .toLowerCase();

        if (
            bodyText.includes("out of stock") ||
            bodyText.includes("sold out") ||
            bodyText.includes(
                "currently unavailable"
            )
        ) {
            inStock = false;
        }

        const priceData = normalizePrices(
            currentPrice,
            Number.isNaN(mrp) ? null : mrp
        );

        if (!priceData.valid) {
            console.log("Invalid price data:", {
                currentPrice,
                mrp,
            });

            return null;
        }

        return {
            source: "flipkart",
            productKey,
            url,

            title,
            brand,
            category,
            modelNumber,
            image,
            specifications,

            currentPrice:
                priceData.currentPrice,

            mrp: priceData.mrp,

            inStock,

            priceValid: priceData.valid,
        };
    } catch (error) {
        console.error(
            "Flipkart scraping error:",
            error.message
        );

        return null;
    }
};