import axios from "axios";
import * as cheerio from "cheerio";

import { normalizePrices } from "../../utils/priceUtils.js";

export const scrapeMyntra = async (url) => {
    try {
        const response = await axios.get(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
                "Accept-Language":
                    "en-IN,en;q=0.9",
            },
            timeout: 10000,
        });

        const $ = cheerio.load(response.data);

        let title = "";
        let brand = "";
        let image = "";
        let currentPrice = "";
        let mrp = "";
        let productKey = "";
        let inStock = true;

        const categories = [];

        // JSON-LD
        $('script[type="application/ld+json"]').each(
            (index, element) => {
                const raw = $(element)
                    .text()
                    .trim();

                if (!raw) return;

                try {
                    const data = JSON.parse(raw);

                    const items = Array.isArray(data)
                        ? data
                        : [data];

                    for (const item of items) {
                        if (
                            !item ||
                            typeof item !== "object"
                        ) {
                            continue;
                        }

                        // Product details
                        if (
                            item["@type"] === "Product" ||
                            item.name
                        ) {
                            if (!title && item.name) {
                                title = String(
                                    item.name
                                ).trim();
                            }

                            if (
                                !image &&
                                item.image
                            ) {
                                image =
                                    Array.isArray(
                                        item.image
                                    )
                                        ? item.image[0]
                                        : String(
                                              item.image
                                          );
                            }

                            if (
                                !productKey &&
                                (item.sku ||
                                    item.mpn)
                            ) {
                                productKey = String(
                                    item.sku ||
                                        item.mpn
                                ).trim();
                            }

                            if (
                                !brand &&
                                item.brand
                            ) {
                                if (
                                    typeof item.brand ===
                                    "object"
                                ) {
                                    brand =
                                        String(
                                            item.brand
                                                .name || ""
                                        ).trim();
                                } else {
                                    brand =
                                        String(
                                            item.brand
                                        ).trim();
                                }
                            }

                            if (item.offers) {
                                const offers =
                                    Array.isArray(
                                        item.offers
                                    )
                                        ? item.offers[0]
                                        : item.offers;

                                // Current price
                                if (
                                    !currentPrice &&
                                    offers?.price
                                ) {
                                    currentPrice =
                                        String(
                                            offers.price
                                        ).trim();
                                }

                                // MRP
                                // Only use highPrice when
                                // it is actually provided.
                                if (
                                    !mrp &&
                                    offers?.highPrice
                                ) {
                                    mrp =
                                        String(
                                            offers.highPrice
                                        ).trim();
                                }

                                // Stock
                                if (
                                    offers?.availability
                                ) {
                                    inStock =
                                        !String(
                                            offers.availability
                                        )
                                            .toLowerCase()
                                            .includes(
                                                "outofstock"
                                            );
                                }
                            }
                        }

                        // Breadcrumb category
                        if (
                            item["@type"] ===
                            "BreadcrumbList"
                        ) {
                            const list =
                                item.itemListElement ||
                                [];

                            for (const entry of list) {
                                const name =
                                    entry?.item?.name;

                                if (name) {
                                    categories.push(
                                        String(
                                            name
                                        ).trim()
                                    );
                                }
                            }
                        }
                    }
                } catch {
                    // Ignore invalid JSON-LD
                }
            }
        );

        // Remove duplicate categories
        const uniqueCategories = [
            ...new Set(categories),
        ];

        const category =
            uniqueCategories.length
                ? uniqueCategories.join(" > ")
                : "";

        // Title fallback
        if (!title) {
            title =
                $(
                    'meta[property="og:title"]'
                )
                    .attr("content")
                    ?.trim() || "";
        }

        if (!title) {
            title = $("title")
                .text()
                .trim();
        }

        // Brand fallback
        if (!brand) {
            const description = $(
                'meta[name="description"]'
            )
                .attr("content")
                ?.trim() || "";

            const brandMatch =
                description.match(
                    /from\s+(.+?)\s+at\s+Rs\./i
                );

            if (brandMatch) {
                brand =
                    brandMatch[1].trim();
            }
        }

        // Image fallback
        if (!image) {
            image =
                $(
                    'meta[property="og:image"]'
                )
                    .attr("content")
                    ?.trim() || "";
        }

        if (!image) {
            image =
                $(
                    'meta[name="twitter:image"]'
                )
                    .attr("content")
                    ?.trim() || "";
        }

        // Product key fallback
        if (!productKey) {
            const match = url.match(
                /\/(\d+)\/buy\/?$/i
            );

            if (match) {
                productKey = match[1];
            }
        }

        // Current price fallback
        if (!currentPrice) {
            const description = $(
                'meta[name="description"]'
            )
                .attr("content")
                ?.trim() || "";

            const priceMatch =
                description.match(
                    /at\s+Rs\.\s*([\d,]+)/i
                );

            if (priceMatch) {
                currentPrice =
                    priceMatch[1];
            }
        }

        // MRP is kept empty if Myntra
        // does not provide a reliable value.

        const priceData =
            normalizePrices(
                currentPrice,
                mrp || null
            );

        if (!priceData.valid) {
            console.log(
                "Invalid Myntra price data:",
                {
                    currentPrice,
                    mrp,
                }
            );

            return null;
        }

        return {
            source: "myntra",
            productKey,
            url,

            title,
            brand,
            category,

            modelNumber: "",

            image,

            specifications: {},

            currentPrice:
                priceData.currentPrice,

            mrp: priceData.mrp,

            inStock,

            priceValid:
                priceData.valid,
        };
    } catch (error) {
        console.error(
            "Myntra scraping error:",
            error.message
        );

        return null;
    }
};