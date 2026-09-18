import mongoose from "mongoose";

export const connectDB = async () => {
    try {
        await mongoose.connect(
            process.env.MONGODB_URI
        );

        console.log(
            "Worker MongoDB connected"
        );

        console.log(
            "Database:",
            mongoose.connection.name
        );

        console.log(
            "Collection:",
            mongoose.connection
                .collection("trackedproducts")
                .collectionName
        );
    } catch (error) {
        console.error(
            "Worker MongoDB connection error:",
            error.message
        );

        process.exit(1);
    }
};