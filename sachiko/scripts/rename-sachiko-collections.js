import mongoose from "mongoose";
import { configDotenv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from the project root regardless of where the script is run from
configDotenv({ path: path.resolve(__dirname, "..", ".env") });

// Reuse the app's connection logic so MONGO_USER/MONGO_PASS + authSource are applied
const { default: connectDB } = await import("../config/db.js");

// Old collection name -> new collection name
const RENAMES = [
  { from: "sachikodatasheets", to: "datasheets" },
  { from: "sachikojobcards", to: "jobcards" },
  { from: "sachikosalesorders", to: "salesorders" },
];

async function renameCollections() {
  try {
    await connectDB();
    console.log("✓ Connected to MongoDB");

    const db = mongoose.connection.db;
    const existing = (await db.listCollections().toArray()).map((c) => c.name);

    for (const { from, to } of RENAMES) {
      if (!existing.includes(from)) {
        console.log(`- Skipping "${from}" (not found)`);
        continue;
      }
      if (existing.includes(to)) {
        console.log(`! Skipping "${from}" -> "${to}" (target "${to}" already exists)`);
        continue;
      }
      await db.renameCollection(from, to);
      console.log(`✓ Renamed "${from}" -> "${to}"`);
    }

    await mongoose.connection.close();
    console.log("✓ Database connection closed");
  } catch (error) {
    console.error("Failed to rename collections:", error);
    process.exit(1);
  }
}

renameCollections();
