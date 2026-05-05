const { MongoClient } = require("mongodb");
const fs = require("fs");
require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://USER:PASS@cluster.mongodb.net/";
const DB_NAME = process.env.DB_NAME || "YOUR_DB_NAME";
const COLLECTION = process.env.COLLECTION || "YOUR_COLLECTION_NAME";
const INPUT_FILE = process.env.INPUT_FILE || "messages.json";

async function restore() {
  console.log("🚀 MongoDB restore started...\n");

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ ${INPUT_FILE} not found. First run 'node scraper.js'.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(INPUT_FILE, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error("❌ JSON parse error:", e.message);
    process.exit(1);
  }

  if (!Array.isArray(data) || data.length === 0) {
    console.warn("⚠️  Data is empty or has wrong format");
    process.exit(0);
  }

  console.log(`📂 Total messages: ${data.length} entries\n`);

  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log("✅ MongoDB connected");

    const db = client.db(DB_NAME);
    const col = db.collection(COLLECTION);

    // Duplicate oldini olish uchun upsert
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (let i = 0; i < data.length; i++) {
      const doc = data[i];
      try {
        // _telegramMsgId bo'yicha upsert (duplicate bo'lmaydi)
        const filter = doc._telegramMsgId
          ? { _telegramMsgId: doc._telegramMsgId }
          : { _id: doc._id || undefined };

        const result = await col.updateOne(
          filter,
          { $set: doc },
          { upsert: true }
        );

        if (result.upsertedCount > 0) inserted++;
        else updated++;
      } catch (e) {
        errors++;
        console.error(`  ⚠️  Doc ${i} error:`, e.message);
      }

      if ((i + 1) % 100 === 0 || i === data.length - 1) {
        process.stdout.write(
          `\r   ${i + 1}/${data.length} — new: ${inserted}, update: ${updated}, error: ${errors}`
        );
      }
    }

    console.log("\n\n✅ Restore completed!");
    console.log(`   New entries added: ${inserted}`);
    console.log(`   Entries updated:      ${updated}`);
    console.log(`   Errors:         ${errors}\n`);
  } catch (err) {
    console.error("❌ MongoDB error:", err.message);
  } finally {
    await client.close();
  }
}

restore();