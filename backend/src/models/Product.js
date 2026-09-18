import mongoose from "mongoose";

// Price history schema
const priceHistorySchema = new mongoose.Schema(
    {
        price: {
            type: Number,
            required: true,
            min: 0,
        },

        checkedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        _id: false,
    }
);

const trackedProductSchema = new mongoose.Schema(
    {
        source: {
            type: String,
            required: true,
            enum: [
                "amazon",
                "flipkart",
                "myntra",
            ],
        },

        productKey: {
            type: String,
            required: true,
            trim: true,
        },

        url: {
            type: String,
            required: true,
            trim: true,
        },

        title: {
            type: String,
            required: true,
            trim: true,
        },

        brand: {
            type: String,
            default: "",
            trim: true,
        },

        category: {
            type: String,
            default: "",
            trim: true,
        },

        modelNumber: {
            type: String,
            default: "",
            trim: true,
        },

        image: {
            type: String,
            default: "",
        },

        specifications: {
            type: Map,
            of: String,
            default: {},
        },

        // Current selling price
        currentPrice: {
            type: Number,
            required: true,
            min: 0,
        },

        // Current MRP
        mrp: {
            type: Number,
            default: null,
            min: 0,
        },

        inStock: {
            type: Boolean,
            default: true,
        },

        // Price history
        history: {
            type: [priceHistorySchema],
            default: [],
        },

        // Last time product was checked
        lastChecked: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

// Prevent duplicate product on the same platform
trackedProductSchema.index(
    {
        source: 1,
        productKey: 1,
    },
    {
        unique: true,
    }
);

export default mongoose.model(
    "TrackedProduct",
    trackedProductSchema,
    "trackedproducts"
);