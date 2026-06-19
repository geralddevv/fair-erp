/**
 * Migrate vendors (and their coordinators) to the Sachiko collections.
 *
 * - Copies `vendors` where commodities include Adhesive / Face paper /
 *   Release paper / Core into `sachikovendors` with SP | VENDOR | 001 IDs.
 * - Copies the associated `vendorusers` into `sachikovendorusers`, updating
 *   vendorId to the new SP ID and stripping SL (PAPER) from commodities.
 *
 * Usage:
 *   node scripts/migrate_sachiko_vendors.js           -- dry run (no writes)
 *   node scripts/migrate_sachiko_vendors.js --apply   -- write to DB
 */

import mongoose from "mongoose";
import { configDotenv } from "dotenv";

configDotenv({ quiet: true });

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://admin:YourStrongPassword@127.0.0.1:27017/sachiko?authSource=admin";

const SACHIKO_COMMODITIES = ["Adhesive", "Face paper", "Release paper", "Core"];
const EXCLUDE_COMMODITIES = ["SL (PAPER)"];

/* ── inline schema definitions ── */

const counterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, required: true, default: 0 },
});
const Counter = mongoose.models.Counter || mongoose.model("Counter", counterSchema);

const vendorSchema = new mongoose.Schema({
  vendorId: String,
  vendorName: String,
  vendorStatus: String,
  hoLocation: String,
  warehouseLocation: String,
  commodities: [String],
  vendorGst: String,
  vendorMsme: String,
  vendorGumasta: String,
  vendorPan: String,
  vendorSignature: String,
});
const Vendor = mongoose.models.Vendor || mongoose.model("Vendor", vendorSchema, "vendors");

const sachikoVendorSchema = new mongoose.Schema({
  vendorId: { type: String, required: true, unique: true },
  vendorName: String,
  vendorStatus: String,
  hoLocation: String,
  warehouseLocation: String,
  commodities: [String],
  vendorGst: String,
  vendorMsme: String,
  vendorGumasta: String,
  vendorPan: String,
  vendorSignature: { type: String, sparse: true },
  sourceVendorId: String,
});
const SachikoVendor =
  mongoose.models.SachikoVendor ||
  mongoose.model("SachikoVendor", sachikoVendorSchema, "sachikovendors");

const vendorUserSchema = new mongoose.Schema({
  vendorId: String,
  vendorName: String,
  hoLocation: String,
  warehouseLocation: String,
  userName: String,
  userLocation: String,
  userDepartment: String,
  userContact: String,
  userEmail: String,
  locationsCount: Number,
  locationDetails: [{ userLocation: String, dispatchAddress: String }],
  dispatchAddress: String,
  transportName: String,
  transportContact: String,
  dropLocation: String,
  dropLocation1: String,
  deliveryMode: String,
  deliveryLocation: String,
  deliveryLocation1: String,
  vendorPayment: String,
  SelfDispatch: String,
  vendorStatus: String,
  ownerName: String,
  ownerMobNo: String,
  ownerEmail: String,
  vendorGst: String,
  vendorMsme: String,
  commodities: [String],
  vendorUserSignature: String,
});
const VendorUser =
  mongoose.models.VendorUser ||
  mongoose.model("VendorUser", vendorUserSchema, "vendorusers");

const sachikoVendorUserSchema = new mongoose.Schema({
  vendorId: String,
  vendorName: String,
  hoLocation: String,
  warehouseLocation: String,
  userName: String,
  userLocation: String,
  userDepartment: String,
  userContact: String,
  userEmail: String,
  locationsCount: Number,
  locationDetails: [{ userLocation: String, dispatchAddress: String }],
  dispatchAddress: String,
  transportName: String,
  transportContact: String,
  dropLocation: String,
  dropLocation1: String,
  deliveryMode: String,
  deliveryLocation: String,
  deliveryLocation1: String,
  vendorPayment: String,
  SelfDispatch: String,
  vendorStatus: String,
  ownerName: String,
  ownerMobNo: String,
  ownerEmail: String,
  vendorGst: String,
  vendorMsme: String,
  vendorUserSignature: { type: String, sparse: true },
  sourceVendorUserId: String,
  sourceVendorId: String,
});
const SachikoVendorUser =
  mongoose.models.SachikoVendorUser ||
  mongoose.model("SachikoVendorUser", sachikoVendorUserSchema, "sachikovendorusers");

/* ── helpers ── */

function padSeq(n) {
  return String(n).padStart(3, "0");
}

async function nextSachikoVendorId() {
  const counter = await Counter.findOneAndUpdate(
    { key: "sachiko_vendorId" },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  let seq = counter.seq;
  while (await SachikoVendor.exists({ vendorId: `SP | VENDOR | ${padSeq(seq)}` })) {
    seq += 1;
  }
  return `SP | VENDOR | ${padSeq(seq)}`;
}

function hasSachikoCommodity(commodities) {
  if (!Array.isArray(commodities)) return false;
  return commodities.some((c) =>
    SACHIKO_COMMODITIES.some((sc) => String(c).trim().toLowerCase() === sc.toLowerCase()),
  );
}

function filterCommodities(commodities) {
  if (!Array.isArray(commodities)) return [];
  return commodities.filter(
    (c) => !EXCLUDE_COMMODITIES.some((ex) => String(c).trim().toLowerCase() === ex.toLowerCase()),
  );
}

/* ── main ── */

async function main() {
  const applyMode = process.argv.includes("--apply");

  console.log("\n  Sachiko Vendor Migration");
  console.log("  Mode:", applyMode ? "APPLY" : "DRY-RUN (pass --apply to write)");
  console.log("  Including commodities:", SACHIKO_COMMODITIES.join(", "));
  console.log("  Excluding commodities:", EXCLUDE_COMMODITIES.join(", "));
  console.log("  Connecting to:", MONGO_URI, "\n");

  await mongoose.connect(MONGO_URI);
  console.log("  Connected.\n");

  const allVendors = await Vendor.find({}).lean();
  const matching = allVendors.filter((v) => hasSachikoCommodity(v.commodities));

  console.log(`  Total vendors in collection : ${allVendors.length}`);
  console.log(`  Matching sachiko commodities: ${matching.length}\n`);

  if (matching.length === 0) {
    console.log("  Nothing to migrate.");
    await mongoose.disconnect();
    process.exit(0);
  }

  let vendorsCreated = 0;
  let vendorsSkipped = 0;
  let coordinatorsCreated = 0;
  let coordinatorsSkipped = 0;

  for (const vendor of matching) {
    const existing = await SachikoVendor.findOne({ sourceVendorId: vendor.vendorId }).lean();
    if (existing) {
      console.log(`  SKIP  "${vendor.vendorName}" — already in sachikovendors as ${existing.vendorId}`);
      vendorsSkipped++;

      // Still check for any coordinators not yet migrated
      const coordinators = await VendorUser.find({ vendorId: vendor.vendorId }).lean();
      for (const coord of coordinators) {
        const coordExisting = await SachikoVendorUser.findOne({ sourceVendorUserId: String(coord._id) }).lean();
        if (coordExisting) {
          coordinatorsSkipped++;
        } else {
          console.log(`    COORDINATOR SKIP (vendor skipped, coord missing)  "${coord.userName}"`);
          coordinatorsSkipped++;
        }
      }
      continue;
    }

    const newId = applyMode ? await nextSachikoVendorId() : `SP | VENDOR | ${padSeq(vendorsCreated + 1)}`;
    const savedCommodities = filterCommodities(vendor.commodities);

    // Find coordinators for this vendor
    const coordinators = await VendorUser.find({ vendorId: vendor.vendorId }).lean();

    console.log(`  ${applyMode ? "CREATE" : "WOULD CREATE"}  "${vendor.vendorName}"`);
    console.log(`    Source ID    : ${vendor.vendorId}`);
    console.log(`    New ID       : ${newId}`);
    console.log(`    Commodities  : ${savedCommodities.join(", ")}`);
    console.log(`    Status       : ${vendor.vendorStatus}`);
    console.log(`    Location     : ${vendor.hoLocation}`);
    console.log(`    Coordinators : ${coordinators.length}`);

    if (applyMode) {
      await SachikoVendor.create({
        vendorId: newId,
        vendorName: vendor.vendorName,
        vendorStatus: vendor.vendorStatus,
        hoLocation: vendor.hoLocation,
        warehouseLocation: vendor.warehouseLocation,
        commodities: savedCommodities,
        vendorGst: vendor.vendorGst,
        vendorMsme: vendor.vendorMsme,
        vendorGumasta: vendor.vendorGumasta,
        vendorPan: vendor.vendorPan,
        vendorSignature: vendor.vendorSignature || undefined,
        sourceVendorId: vendor.vendorId,
      });
    }
    vendorsCreated++;

    // Migrate coordinators
    for (const coord of coordinators) {
      const coordExisting = await SachikoVendorUser.findOne({ sourceVendorUserId: String(coord._id) }).lean();
      if (coordExisting) {
        console.log(`      SKIP coordinator "${coord.userName}" — already migrated`);
        coordinatorsSkipped++;
        continue;
      }

      console.log(`      ${applyMode ? "CREATE" : "WOULD CREATE"} coordinator  "${coord.userName}"  (${coord.userLocation})`);

      if (applyMode) {
        await SachikoVendorUser.create({
          vendorId: newId,
          vendorName: vendor.vendorName,
          hoLocation: coord.hoLocation,
          warehouseLocation: coord.warehouseLocation,
          userName: coord.userName,
          userLocation: coord.userLocation,
          userDepartment: coord.userDepartment,
          userContact: coord.userContact,
          userEmail: coord.userEmail,
          locationsCount: coord.locationsCount,
          locationDetails: coord.locationDetails || [],
          dispatchAddress: coord.dispatchAddress,
          transportName: coord.transportName,
          transportContact: coord.transportContact,
          dropLocation: coord.dropLocation,
          dropLocation1: coord.dropLocation1,
          deliveryMode: coord.deliveryMode,
          deliveryLocation: coord.deliveryLocation,
          deliveryLocation1: coord.deliveryLocation1,
          vendorPayment: coord.vendorPayment,
          SelfDispatch: coord.SelfDispatch,
          vendorStatus: coord.vendorStatus,
          ownerName: coord.ownerName,
          ownerMobNo: coord.ownerMobNo,
          ownerEmail: coord.ownerEmail,
          vendorGst: coord.vendorGst,
          vendorMsme: coord.vendorMsme,
          vendorUserSignature: coord.vendorUserSignature || undefined,
          sourceVendorUserId: String(coord._id),
          sourceVendorId: vendor.vendorId,
        });
      }
      coordinatorsCreated++;
    }
    console.log("");
  }

  console.log("  ─────────────────────────────────────");
  console.log(`  Vendors matched  : ${matching.length}`);
  console.log(`  Vendors skipped  : ${vendorsSkipped} (already migrated)`);
  console.log(`  Vendors ${applyMode ? "created " : "to create"} : ${vendorsCreated}`);
  console.log(`  Coords skipped   : ${coordinatorsSkipped} (already migrated)`);
  console.log(`  Coords ${applyMode ? "created  " : "to create"} : ${coordinatorsCreated}`);

  if (!applyMode && (vendorsCreated + coordinatorsCreated) > 0) {
    console.log("\n  Run with --apply to write these records to the database.");
  }

  await mongoose.disconnect();
  console.log("\n  Done.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
