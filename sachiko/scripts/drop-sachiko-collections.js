import mongoose from "mongoose";
import { configDotenv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from the project root regardless of where the script is run from
configDotenv({ path: path.resolve(__dirname, "..", ".env") });

// Reuse the app's connection logic so MONGO_USER/MONGO_PASS + authSource are applied
const { default: connectDB } = await import("../config/db.js");

// Sachiko-prefixed copies created by the sac-mig scripts. These are copies of
// the base collections (clients/vendors/usernames/vendorusers), which are left
// untouched. Safe to drop.
const TO_DROP = [
  "sachikoclients",
  "sachikoclientusers",
  "sachikovendors",
  "sachikovendorusers",
];

async function dropCollections() {
  try {
    await connectDB();
    console.log("✓ Connected to MongoDB");

    const db = mongoose.connection.db;
    const existing = (await db.listCollections().toArray()).map((c) => c.name);

    for (const name of TO_DROP) {
      if (!existing.includes(name)) {
        console.log(`- Skipping "${name}" (not found)`);
        continue;
      }
      await db.dropCollection(name);
      console.log(`✓ Dropped "${name}"`);
    }

    await mongoose.connection.close();
    console.log("✓ Database connection closed");
  } catch (error) {
    console.error("Failed to drop collections:", error);
    process.exit(1);
  }
}

dropCollections();
