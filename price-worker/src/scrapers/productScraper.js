import { scrapeAmazon } from "./amazonScraper.js";
import { scrapeFlipkart } from "./flipkartScraper.js";
import { scrapeMyntra } from "./myntraScraper.js";

export const scrapeProduct = async (source, url) => {
    if (source === "amazon") {
        return await scrapeAmazon(url);
    }

    if (source === "flipkart") {
        return await scrapeFlipkart(url);
    }

    if (source === "myntra") {
        return await scrapeMyntra(url);
    }

    throw new Error(
        `Unsupported source: ${source}`
    );
};