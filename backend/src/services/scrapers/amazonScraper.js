import axios from "axios";
import * as cheerio from "cheerio";

import { normalizePrices } from "../../utils/priceUtils.js";

const extractProductKey = (url) => {
    const match = url.match(
        /(?:dp|gp\/product)\/([A-Z0-9]{10})/i
    );

    return match
        ? match[1].toUpperCase()
        : "";
};

const cleanPrice = (value) => {
    if (!value) {
        return "";
    }

    return String(value)
        .replace(/\s+/g, " ")
        .trim();
};

export const scrapeAmazon = async (url) => {
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

        const $ = cheerio.load(
            response.data
        );

        let title = "";
        let image = "";
        let currentPrice = "";
        let mrp = "";
        let inStock = true;

        // -------------------------
        // JSON-LD
        // -------------------------

        $('script[type="application/ld+json"]').each(
            (_, element) => {
                const raw = $(element)
                    .text()
                    .trim();

                if (!raw) {
                    return;
                }

                try {
                    const parsed =
                        JSON.parse(raw);

                    const items =
                        Array.isArray(parsed)
                            ? parsed
                            : [parsed];

                    for (const item of items) {
                        if (
                            !item ||
                            typeof item !==
                                "object"
                        ) {
                            continue;
                        }

                        if (
                            !title &&
                            item.name
                        ) {
                            title =
                                String(
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
                            !currentPrice &&
                            item.offers?.price
                        ) {
                            currentPrice =
                                String(
                                    item.offers
                                        .price
                                );
                        }

                        if (
                            !mrp &&
                            item.offers
                                ?.highPrice
                        ) {
                            mrp =
                                String(
                                    item.offers
                                        .highPrice
                                );
                        }

                        if (
                            item.offers
                                ?.availability
                        ) {
                            inStock =
                                !String(
                                    item
                                        .offers
                                        .availability
                                )
                                    .toLowerCase()
                                    .includes(
                                        "outofstock"
                                    );
                        }
                    }
                } catch {
                    // Ignore invalid JSON-LD
                }
            }
        );

        // -------------------------
        // Title fallback
        // -------------------------

        if (!title) {
            title = $(
                "#productTitle"
            )
                .text()
                .trim();
        }

        // -------------------------
        // Current Price
        // -------------------------

        if (!currentPrice) {
            const selectors = [
                "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",

                "#corePrice_feature_div .a-price .a-offscreen",

                "#priceblock_dealprice",

                "#priceblock_ourprice",

                ".priceToPay .a-offscreen",

                ".a-price.aok-align-center .a-offscreen",

                ".a-price .a-offscreen",
            ];

            for (const selector of selectors) {
                const value = $(
                    selector
                )
                    .first()
                    .text()
                    .trim();

                if (value) {
                    currentPrice =
                        value;

                    break;
                }
            }
        }

        // -------------------------
        // MRP
        // -------------------------

        if (!mrp) {
            const selectors = [
                "#corePriceDisplay_desktop_feature_div .a-text-price .a-offscreen",

                "#corePrice_feature_div .a-text-price .a-offscreen",

                ".basisPrice .a-offscreen",

                ".a-text-price .a-offscreen",

                "#priceblock_listprice",
            ];

            for (const selector of selectors) {
                const value = $(
                    selector
                )
                    .first()
                    .text()
                    .trim();

                if (value) {
                    mrp = value;

                    break;
                }
            }
        }

        currentPrice =
            cleanPrice(
                currentPrice
            );

        mrp =
            cleanPrice(mrp);

        // -------------------------
        // Image
        // -------------------------

        if (!image) {
            image =
                $("#landingImage")
                    .attr("src") ||
                $(
                    "#imgTagWrapperId img"
                ).attr("src") ||
                "";
        }

        // -------------------------
        // Brand
        // -------------------------

        let brand = $(
            "#bylineInfo"
        )
            .text()
            .trim()
            .replace(
                /^Brand:\s*/i,
                ""
            )
            .replace(
                /^Visit the\s+/i,
                ""
            )
            .replace(
                /\s+Store$/i,
                ""
            )
            .trim();

        // -------------------------
        // Category
        // -------------------------

        const category = $(
            "#wayfinding-breadcrumbs_feature_div ul li"
        )
            .last()
            .text()
            .trim();

        // -------------------------
        // Model Number
        // -------------------------

        let modelNumber = "";

        $("tr").each(
            (_, element) => {
                const key = $(
                    element
                )
                    .find("th")
                    .text()
                    .trim()
                    .toLowerCase();

                if (
                    key ===
                        "model number" ||
                    key ===
                        "item model number"
                ) {
                    modelNumber =
                        $(element)
                            .find("td")
                            .text()
                            .trim();
                }
            }
        );

        // -------------------------
        // ASIN / Product Key
        // -------------------------

        const asinText = $("tr")
            .filter(
                (_, element) => {
                    return (
                        $(element)
                            .find("th")
                            .text()
                            .trim()
                            .toLowerCase() ===
                        "asin"
                    );
                }
            )
            .find("td")
            .text()
            .trim();

        // Amazon can sometimes return:
        // B09YHVR3FF B09YHVR3FF
        //
        // Keep only the first ASIN.

        const asin = asinText
            .split(/\s+/)[0]
            .toUpperCase();

        const productKey =
            asin ||
            extractProductKey(url);

        // -------------------------
        // Specifications
        // -------------------------

        const specifications = {};

        const requiredSpecs = [
            "capacity",
            "wattage",
            "voltage",
            "material type",
            "colour",
            "color",
            "style name",
            "item type name",
        ];

        $("tr").each(
            (_, element) => {
                const key = $(element)
                    .find("th")
                    .text()
                    .trim();

                const value = $(
                    element
                )
                    .find("td")
                    .text()
                    .trim();

                if (
                    key &&
                    value &&
                    requiredSpecs.includes(
                        key.toLowerCase()
                    )
                ) {
                    specifications[
                        key
                    ] = value;
                }
            }
        );

        // -------------------------
        // Stock
        // -------------------------

        const stockText = $(
            "#availability"
        )
            .text()
            .trim()
            .toLowerCase();

        if (
            stockText.includes(
                "currently unavailable"
            ) ||
            stockText.includes(
                "out of stock"
            )
        ) {
            inStock = false;
        }

        // -------------------------
        // Normalize Prices
        // -------------------------

        const priceData =
            normalizePrices(
                currentPrice,
                mrp
            );

        // Never save zero / invalid price
        if (
            !priceData.valid ||
            priceData.currentPrice <= 0
        ) {
            console.log(
                "Invalid Amazon price data:",
                {
                    currentPrice,
                    mrp,
                    normalized:
                        priceData,
                }
            );

            return null;
        }

        // -------------------------
        // Final Result
        // -------------------------

        return {
            source: "amazon",
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

            mrp:
                priceData.mrp,

            inStock,

            priceValid:
                priceData.valid,
        };
    } catch (error) {
        console.error(
            "Amazon scraping error:",
            error.message
        );

        return null;
    }
};