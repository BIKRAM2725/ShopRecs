import mongoose from "mongoose";

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

const trackedProductSchema =
    new mongoose.Schema(
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

            currentPrice: {
                type: Number,
                required: true,
                min: 0,
            },

            mrp: {
                type: Number,
                default: null,
                min: 0,
            },

            inStock: {
                type: Boolean,
                default: true,
            },

            history: {
                type: [priceHistorySchema],
                default: [],
            },

            lastChecked: {
                type: Date,
                default: Date.now,
            },
        },
        {
            timestamps: true,
        }
    );

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