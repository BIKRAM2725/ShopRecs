export const parsePrice = (value) => {
    if (value === null || value === undefined) {
        return null;
    }

    const cleanedValue = String(value)
        .replace(/[₹,\s]/g, "")
        .replace(/[^\d.]/g, "");

    const price = Number(cleanedValue);

    return Number.isFinite(price) ? price : null;
};


export const normalizePrices = (currentPrice, mrp) => {
    const price = parsePrice(currentPrice);
    const originalPrice = parsePrice(mrp);

    if (price === null || price < 0) {
        return {
            currentPrice: null,
            mrp: null,
            valid: false,
        };
    }

    if (
        originalPrice === null ||
        originalPrice <= 0
    ) {
        return {
            currentPrice: price,
            mrp: null,
            valid: true,
        };
    }

    if (price > originalPrice) {
        return {
            currentPrice: price,
            mrp: originalPrice,
            valid: false,
        };
    }

    return {
        currentPrice: price,
        mrp: originalPrice,
        valid: true,
    };
};