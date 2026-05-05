const https = require("https");
const fs = require("fs");
require("dotenv").config();

const BOT_TOKEN = process.env.BOT_TOKEN || "YOUR_BOT_TOKEN_HERE";
const CHAT_ID = process.env.CHAT_ID || "YOUR_CHANNEL_ID_HERE"; // ex: @mychannel or -1001234567890
const OUTPUT_FILE = "messages.json";
const DELAY_MS = 300; // rate limit

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function tgRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams(params).toString();
    const path = `/bot${BOT_TOKEN}/${method}?${query}`;
    const options = { hostname: "api.telegram.org", path, method: "GET" };

    https
      .get(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

// Xabar textidan JSON ajratib oladi
function parseMessage(text) {
  if (!text) return null;
  // JSON blok ichida bo'lsa (```json ... ```)
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try {
      return JSON.parse(codeBlock[1].trim());
    } catch {}
  }
  // To'g'ridan-to'g'ri JSON
  try {
    return JSON.parse(text.trim());
  } catch {}
  return null;
}

async function scrapeChannel() {
  console.log("🚀 Telegram scraper working...\n");

  const chatInfo = await tgRequest("getChat", { chat_id: CHAT_ID });
  if (!chatInfo.ok) {
    console.error("❌ Chat not found:", chatInfo.description);
    console.error(
      "CHAT_ID wrong"
    );
    process.exit(1);
  }
  console.log(`✅ Chat: ${chatInfo.result.title || chatInfo.result.username}`);

  const allMessages = [];
  const parsedData = [];
  let offset = 0;
  let totalFetched = 0;
  let hasMore = true;

  console.log("📥 Messages fetching...\n");

  while (hasMore) {
    const res = await tgRequest("getUpdates", {
      offset,
      limit: 100,
      timeout: 0,
    });

    if (!res.ok || !res.result || res.result.length === 0) {
      hasMore = false;
      break;
    }

    for (const update of res.result) {
      offset = update.update_id + 1;
      const msg =
        update.message ||
        update.channel_post ||
        update.edited_message ||
        update.edited_channel_post;

      if (!msg) continue;
      if (String(msg.chat.id) !== String(CHAT_ID) &&
          msg.chat.username !== CHAT_ID.replace("@", "")) continue;

      allMessages.push(msg);

      const parsed = parseMessage(msg.text || msg.caption);
      if (parsed) {
        parsedData.push({
          _telegramMsgId: msg.message_id,
          _date: new Date(msg.date * 1000).toISOString(),
          ...parsed,
        });
      }

      totalFetched++;
    }

    process.stdout.write(`\r   Downloaded: ${totalFetched}...`);

    if (res.result.length < 100) {
      hasMore = false;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n\n📊 Total messages fetched: ${totalFetched}`);
  console.log(`📦 JSON parsed: ${parsedData.length} entries\n`);

  fs.writeFileSync("raw_messages.json", JSON.stringify(allMessages, null, 2));
  console.log("💾 raw_messages.json saved");

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(parsedData, null, 2));
  console.log(`💾 ${OUTPUT_FILE} saved\n`);

  return parsedData;
}

// Bot orqali forward qilingan xabarlarni olish (agar kanal private bo'lsa)
async function scrapeViaForwardedMessages() {
  console.log("🔄 Bot messages checking...\n");

  const updates = await tgRequest("getUpdates", { limit: 100, timeout: 0 });
  if (!updates.ok) {
    console.error("❌ getUpdates error:", updates.description);
    return [];
  }

  const messages = updates.result
    .map(
      (u) =>
        u.message || u.channel_post || u.edited_message || u.edited_channel_post
    )
    .filter(Boolean);

  return messages;
}

scrapeChannel().catch(async (err) => {
  console.error("❌ Error:", err.message);
  console.log("\n⚠️  If getUpdates doesn't work, try scraping forwarded messages:");
  console.log("   npm run scrape-bot\n");
});