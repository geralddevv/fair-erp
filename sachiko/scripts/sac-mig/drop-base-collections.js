import mongoose from "mongoose";
import { configDotenv } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import connectDB from "../config/db.js";

// Load .env from the project root regardless of the current working directory,
// so the script works whether run from the project root or from scripts/.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
configDotenv({ path: path.resolve(__dirname, "../.env") });

// For every collection named "sachiko<x>", drop the matching base collection
// "<x>" if it exists (e.g. sachikoclients -> drop clients). Only base
// collections that have a sachiko-prefixed counterpart are dropped; the
// sachiko-prefixed collections themselves are kept untouched.
//
//   node scripts/drop-base-collections.js            # actually drops
//   node scripts/drop-base-collections.js --dry-run  # preview only

const PREFIX = "sachiko";
const dryRun = process.argv.includes("--dry-run");

async function dropBaseCollections() {
  try {
    await connectDB();

    const db = mongoose.connection.db;
    const dbName = mongoose.connection.name;

    const names = (await db.listCollections().toArray()).map((c) => c.name);
    const existing = new Set(names);

    // Derive base names from the sachiko-prefixed collections, then keep only
    // those whose base collection actually exists in the database.
    const targets = [];
    for (const name of names) {
      if (!name.toLowerCase().startsWith(PREFIX)) continue;
      const base = name.slice(PREFIX.length).replace(/^[_-]/, ""); // strip leading _ or -
      if (base && existing.has(base)) {
        targets.push({ source: name, base });
      }
    }

    if (targets.length === 0) {
      console.log(
        `No base collections with a "${PREFIX}" counterpart found in "${dbName}".`
      );
      return;
    }

    console.log(
      `Found ${targets.length} base collection(s) to drop in "${dbName}":`
    );
    targets.forEach(({ source, base }) => console.log(`  - ${base}  (from ${source})`));

    if (dryRun) {
      console.log("\nDry run — nothing was dropped.");
      return;
    }

    for (const { base } of targets) {
      await db.dropCollection(base);
      console.log(`✓ Dropped ${base}`);
    }

    console.log(`\nDone. Dropped ${targets.length} collection(s).`);
  } catch (error) {
    console.error("Failed to drop base collections:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    console.log("✓ Database connection closed");
  }
}

dropBaseCollections();
