/**
 * Migrate dealer clients (and their users) to the Sachiko collections.
 *
 * - Copies `clients` where clientType = "DEALER" into `sachikoclients`
 *   with SP | CLIENT | 001 style IDs.
 * - Copies the associated `usernames` into `sachikoclientusers`, updating
 *   clientId to the new SP ID.
 *
 * Usage:
 *   node scripts/migrate_sachiko_clients.js           -- dry run (no writes)
 *   node scripts/migrate_sachiko_clients.js --apply   -- write to DB
 */

import mongoose from "mongoose";
import { configDotenv } from "dotenv";

configDotenv({ quiet: true });

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://admin:YourStrongPassword@127.0.0.1:27017/sachiko?authSource=admin";

/* ── inline schema definitions ── */

const counterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, required: true, default: 0 },
});
const Counter = mongoose.models.Counter || mongoose.model("Counter", counterSchema);

const clientSchema = new mongoose.Schema({
  clientId: String,
  clientName: String,
  clientType: String,
  clientStatus: String,
  hoLocation: String,
  accountHead: String,
  clientGst: String,
  clientMsme: String,
  clientGumasta: String,
  clientPan: String,
  clientSignature: String,
});
const Client = mongoose.models.Client || mongoose.model("Client", clientSchema, "clients");

const sachikoClientSchema = new mongoose.Schema({
  clientId: { type: String, required: true, unique: true },
  clientName: String,
  clientType: String,
  clientStatus: String,
  hoLocation: String,
  accountHead: String,
  clientGst: String,
  clientMsme: String,
  clientGumasta: String,
  clientPan: String,
  clientSignature: { type: String, sparse: true },
  sourceClientId: String,
});
const SachikoClient =
  mongoose.models.SachikoClient ||
  mongoose.model("SachikoClient", sachikoClientSchema, "sachikoclients");

const usernameSchema = new mongoose.Schema({
  clientId: String,
  clientName: String,
  clientType: String,
  hoLocation: String,
  accountHead: String,
  userName: String,
  userLocation: String,
  userDepartment: String,
  userContact: String,
  userEmail: String,
  dispatchAddress: String,
  locationsCount: Number,
  locationDetails: [{ userLocation: String, dispatchAddress: String }],
  transportName: String,
  transportContact: String,
  dropLocation: String,
  deliveryMode: String,
  deliveryLocation: String,
  clientPayment: String,
  SelfDispatch: String,
  clientStatus: String,
  ownerName: String,
  ownerMobNo: String,
  ownerEmail: String,
  clientGst: String,
  clientMsme: String,
  clientGumasta: String,
  clientPan: String,
  userSignature: String,
});
const Username =
  mongoose.models.Username || mongoose.model("Username", usernameSchema, "usernames");

const sachikoClientUserSchema = new mongoose.Schema({
  clientId: String,
  clientName: String,
  clientType: String,
  hoLocation: String,
  accountHead: String,
  userName: String,
  userLocation: String,
  userDepartment: String,
  userContact: String,
  userEmail: String,
  dispatchAddress: String,
  locationsCount: Number,
  locationDetails: [{ userLocation: String, dispatchAddress: String }],
  transportName: String,
  transportContact: String,
  dropLocation: String,
  deliveryMode: String,
  deliveryLocation: String,
  clientPayment: String,
  SelfDispatch: String,
  clientStatus: String,
  ownerName: String,
  ownerMobNo: String,
  ownerEmail: String,
  clientGst: String,
  clientMsme: String,
  clientGumasta: String,
  clientPan: String,
  userSignature: { type: String, sparse: true },
  sourceUserId: String,
  sourceClientId: String,
});
const SachikoClientUser =
  mongoose.models.SachikoClientUser ||
  mongoose.model("SachikoClientUser", sachikoClientUserSchema, "sachikoclientusers");

/* ── helpers ── */

function padSeq(n) {
  return String(n).padStart(3, "0");
}

async function nextSachikoClientId() {
  const counter = await Counter.findOneAndUpdate(
    { key: "sachiko_clientId" },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  let seq = counter.seq;
  while (await SachikoClient.exists({ clientId: `SP | CLIENT | ${padSeq(seq)}` })) {
    seq += 1;
  }
  return `SP | CLIENT | ${padSeq(seq)}`;
}

/* ── main ── */

async function main() {
  const applyMode = process.argv.includes("--apply");

  console.log("\n  Sachiko Client Migration");
  console.log("  Mode:", applyMode ? "APPLY" : "DRY-RUN (pass --apply to write)");
  console.log("  Connecting to:", MONGO_URI, "\n");

  await mongoose.connect(MONGO_URI);
  console.log("  Connected.\n");

  const dealers = await Client.find({ clientType: "DEALER" }).lean();
  console.log(`  Found ${dealers.length} DEALER client(s) in the clients collection.\n`);

  if (dealers.length === 0) {
    console.log("  Nothing to migrate.");
    await mongoose.disconnect();
    process.exit(0);
  }

  let clientsCreated = 0;
  let clientsSkipped = 0;
  let usersCreated = 0;
  let usersSkipped = 0;

  for (const dealer of dealers) {
    const existing = await SachikoClient.findOne({ sourceClientId: dealer.clientId }).lean();

    if (existing) {
      console.log(`  SKIP  "${dealer.clientName}" — already in sachikoclients as ${existing.clientId}`);
      clientsSkipped++;

      const clientUsers = await Username.find({ clientId: dealer.clientId }).lean();
      for (const u of clientUsers) {
        const userExisting = await SachikoClientUser.findOne({ sourceUserId: String(u._id) }).lean();
        if (userExisting) {
          usersSkipped++;
        } else {
          console.log(`    USER NOT YET MIGRATED  "${u.userName}" — source client already migrated`);
          usersSkipped++;
        }
      }
      continue;
    }

    const newId = applyMode
      ? await nextSachikoClientId()
      : `SP | CLIENT | ${padSeq(clientsCreated + 1)}`;

    const clientUsers = await Username.find({ clientId: dealer.clientId }).lean();

    console.log(`  ${applyMode ? "CREATE" : "WOULD CREATE"}  "${dealer.clientName}"`);
    console.log(`    Source ID : ${dealer.clientId}`);
    console.log(`    New ID    : ${newId}`);
    console.log(`    Type      : ${dealer.clientType}`);
    console.log(`    Status    : ${dealer.clientStatus}`);
    console.log(`    Location  : ${dealer.hoLocation}`);
    console.log(`    Users     : ${clientUsers.length}`);

    if (applyMode) {
      await SachikoClient.create({
        clientId: newId,
        clientName: dealer.clientName,
        clientType: dealer.clientType,
        clientStatus: dealer.clientStatus,
        hoLocation: dealer.hoLocation,
        accountHead: dealer.accountHead,
        clientGst: dealer.clientGst,
        clientMsme: dealer.clientMsme,
        clientGumasta: dealer.clientGumasta,
        clientPan: dealer.clientPan,
        clientSignature: dealer.clientSignature || undefined,
        sourceClientId: dealer.clientId,
      });
    }
    clientsCreated++;

    for (const u of clientUsers) {
      const userExisting = await SachikoClientUser.findOne({ sourceUserId: String(u._id) }).lean();
      if (userExisting) {
        console.log(`      SKIP user "${u.userName}" — already migrated`);
        usersSkipped++;
        continue;
      }

      console.log(`      ${applyMode ? "CREATE" : "WOULD CREATE"} user  "${u.userName}"  (${u.userLocation})`);

      if (applyMode) {
        await SachikoClientUser.create({
          clientId: newId,
          clientName: dealer.clientName,
          clientType: dealer.clientType,
          hoLocation: dealer.hoLocation,
          accountHead: dealer.accountHead,
          userName: u.userName,
          userLocation: u.userLocation,
          userDepartment: u.userDepartment,
          userContact: u.userContact,
          userEmail: u.userEmail,
          dispatchAddress: u.dispatchAddress,
          locationsCount: u.locationsCount,
          locationDetails: u.locationDetails || [],
          transportName: u.transportName,
          transportContact: u.transportContact,
          dropLocation: u.dropLocation,
          deliveryMode: u.deliveryMode,
          deliveryLocation: u.deliveryLocation,
          clientPayment: u.clientPayment,
          SelfDispatch: u.SelfDispatch,
          clientStatus: u.clientStatus,
          ownerName: u.ownerName,
          ownerMobNo: u.ownerMobNo,
          ownerEmail: u.ownerEmail,
          clientGst: u.clientGst,
          clientMsme: u.clientMsme,
          clientGumasta: u.clientGumasta,
          clientPan: u.clientPan,
          userSignature: u.userSignature || undefined,
          sourceUserId: String(u._id),
          sourceClientId: dealer.clientId,
        });
      }
      usersCreated++;
    }
    console.log("");
  }

  console.log("  ─────────────────────────────────────");
  console.log(`  Clients found   : ${dealers.length}`);
  console.log(`  Clients skipped : ${clientsSkipped} (already migrated)`);
  console.log(`  Clients ${applyMode ? "created " : "to create"}: ${clientsCreated}`);
  console.log(`  Users skipped   : ${usersSkipped} (already migrated)`);
  console.log(`  Users ${applyMode ? "created  " : "to create"} : ${usersCreated}`);

  if (!applyMode && (clientsCreated + usersCreated) > 0) {
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
