# Telegram → MongoDB Restore

## O'rnatish

```bash
cd dataRestorerFromTG
npm install
```

## 1-qadam: Config sozlash

`scraper.js` ichida:
```js
const BOT_TOKEN = "7123456789:AAF..."; // @BotFather dan olgan token
const CHAT_ID   = "@your_channel";     // yoki raqamli: -1001234567890
```

`restore.js` ichida:
```js
const MONGO_URI  = "mongodb+srv://user:pass@cluster.mongodb.net/";
const DB_NAME    = "mydb";
const COLLECTION = "mycollection";
```

Yoki env variable sifatida:
```bash
BOT_TOKEN=xxx CHAT_ID=@chan MONGO_URI=xxx DB_NAME=mydb COLLECTION=col npm run full
```

## 2-qadam: Scraping

```bash
npm run scrape
```

Natija:
- `raw_messages.json` — barcha xom xabarlar
- `messages.json` — JSON parse qilingan yozuvlar

## 3-qadam: MongoDB ga yuklash

```bash
npm run restore
```

## Muammo: getUpdates ishlamayapti

`getUpdates` faqat bot orqali kelgan xabarlarni ko'rsatadi.
**Kanal xabarlari** uchun bot admin bo'lishi kerak va
xabarlar bot register qilingandan keyin yuborilgan bo'lishi kerak.

Eski xabarlar uchun yechim:
1. Telegram Desktop → kanal → Export chat history (JSON format)
2. Chiqarilgan `result.json` ni `messages.json` ga ko'chiring
3. `restore.js` ni `INPUT_FILE=result.json` bilan ishga tushiring

## Channel ID topish

Botni kanalga admin qilib qo'ying, keyin:
```
https://api.telegram.org/bot<TOKEN>/getUpdates
```
`"chat":{"id": -1001234567890}` — shu raqam CHAT_ID