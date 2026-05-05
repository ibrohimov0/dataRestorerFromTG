require("dotenv").config();
const fs = require("fs");
const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;
const COLLECTION = process.env.COLLECTION; // "products" yoki sizning collection
const HTML_FILES = ["messages.html", "messages2.html"]; // bir papkada bo'lsin

// HTML fayldan xabarlarni ajratib olish
function extractMessages(filepath) {
  if (!fs.existsSync(filepath)) {
    console.warn(`⚠️  ${filepath} topilmadi, o'tkazib yuborildi`);
    return [];
  }
  const content = fs.readFileSync(filepath, "utf8");
  const blocks = content.split(/(?=<div class="message default clearfix)/);
  const results = [];

  for (const block of blocks) {
    const idMatch = block.match(/id="(message\d+)"/);
    if (!idMatch) continue;

    const dateMatch = block.match(
      /title="(\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}[^"]*)"/
    );
    const senderMatch = block.match(
      /class="from_name">\s*([\s\S]+?)\s*<\/div>/
    );
    const textMatch = block.match(/class="text">([\s\S]*?)<\/div>/);
    if (!textMatch) continue;

    const rawText = textMatch[1];
    const cleanText = rawText
      .replace(/<[^>]+>/g, " ")
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanText) continue;

    results.push({
      id: idMatch[1],
      date: dateMatch ? dateMatch[1] : null,
      sender: senderMatch
        ? senderMatch[1].replace(/\s+/g, " ").trim()
        : null,
      text: cleanText,
    });
  }
  return results;
}

// DD.MM.YYYY HH:MM:SS → ISO
function parseDate(d) {
  if (!d) return null;
  const m = d.match(/(\d{2})\.(\d{2})\.(\d{4}) (\d{2}:\d{2}:\d{2})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}+05:00`);
  return null;
}

function extractVal(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = text.match(
    new RegExp(escaped + "\\s*[:\\-]?\\s*([^\\s📦💰💵🧧🆔📱💽✨📦📅⬇⬆🖼👤📝📞👥━\\n]+)")
  );
  return m ? m[1].trim().replace(/\$$/, "").trim() : null;
}

function toNum(val) {
  if (!val) return null;
  const v = parseFloat(val.replace(/[^\d.\-]/g, ""));
  return isNaN(v) ? null : v;
}

// Xabarni parse qilib MongoDB document ga aylantirish
function parseActivityMessage(msg) {
  const t = msg.text;
  const isEdit = t.includes("o'zgartirildi") || t.includes("o`zgartirildi");
  const isDelete = t.includes("o'chirdi");

  const model = extractVal(t, "Model");
  const inn = toNum(extractVal(t, "Olindi"));
  const sold = toNum(extractVal(t, "Sotildi"));
  const imei = extractVal(t, "IMEI");
  const userMatch = t.match(/Foydalanuvchi\s*[:\s]+([^\s📦💰💵🧧🆔]+)/);
  const user = userMatch ? userMatch[1].trim() : msg.sender;
  const passImgMatch = t.match(/Passport rasmi[:\s]+(https?:\/\/\S+)/);
  const passImg = passImgMatch ? passImgMatch[1] : null;

  return {
    _telegramMsgId: msg.id,
    _parsedAt: new Date().toISOString(),
    _msgType: isDelete ? "delete_log" : isEdit ? "edit" : "add",
    model: model && model !== "null" ? model : null,
    in: inn,
    sold: sold && sold > 0 ? sold : null,
    imei: imei && imei !== "Noma'lum" && imei !== "Tekshiruv" ? imei : null,
    user: user,
    passImage: passImg,
    buyDate: parseDate(msg.date),
    category: "activity",
    type: "default",
    for: "listActivity",
  };
}

async function main() {
  console.log("📂 HTML fayllar o'qilmoqda...\n");

  // Barcha xabarlarni yig'ish
  let allMessages = [];
  for (const file of HTML_FILES) {
    const msgs = extractMessages(file);
    console.log(`  ${file}: ${msgs.length} ta xabar`);
    allMessages = allMessages.concat(msgs);
  }
  console.log(`\n📊 Jami xabarlar: ${allMessages.length}`);

  // Parse qilish
  const activityMsgs = allMessages.filter(
    (m) =>
      m.text.includes("Yangi Aktivlik") ||
      m.text.includes("o'zgartirildi") ||
      m.text.includes("o'chirdi")
  );
  console.log(`📦 Activity xabarlar: ${activityMsgs.length}`);

  const documents = activityMsgs.map(parseActivityMessage);

  // JSON ga saqlash (backup)
  fs.writeFileSync("parsed_activities.json", JSON.stringify(documents, null, 2));
  console.log(`\n💾 parsed_activities.json saqlandi (${documents.length} ta yozuv)`);

  // MongoDB ga yuklash
  if (!MONGO_URI || !DB_NAME || !COLLECTION) {
    console.error("\n❌ .env ichida MONGO_URI, DB_NAME, COLLECTION to'ldirilmagan!");
    process.exit(1);
  }

  console.log("\n🔌 MongoDB ga ulanmoqda...");
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log("✅ Ulandi!\n");

    const col = client.db(DB_NAME).collection(COLLECTION);
    let inserted = 0, updated = 0, errors = 0;

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      try {
        const res = await col.updateOne(
          { _telegramMsgId: doc._telegramMsgId },
          { $set: doc },
          { upsert: true }
        );
        if (res.upsertedCount > 0) inserted++;
        else updated++;
      } catch (e) {
        errors++;
      }

      if ((i + 1) % 50 === 0 || i === documents.length - 1) {
        process.stdout.write(
          `\r   ${i + 1}/${documents.length} — yangi: ${inserted}, update: ${updated}, xato: ${errors}`
        );
      }
    }

    console.log("\n\n✅ Restore yakunlandi!");
    console.log(`   Yangi:   ${inserted}`);
    console.log(`   Update:  ${updated}`);
    console.log(`   Xatolar: ${errors}`);
  } finally {
    await client.close();
  }
}

main().catch(console.error);