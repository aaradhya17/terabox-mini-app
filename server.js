// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer'); // Added Puppeteer
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN is not set');
  process.exit(1);
}

const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : `http://localhost:${PORT}`;

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
const WEBHOOK_URL = `${BASE_URL}/api/telegram/webhook`;
bot.setWebHook(WEBHOOK_URL).catch(console.error);

app.post('/api/telegram/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// New Puppeteer Extraction Logic
async function extractVideoUrl(url) {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Attempt to find the video source
    const videoUrl = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video ? video.src : null;
    });

    if (!videoUrl) throw new Error('Video source not found');
    return videoUrl;
  } finally {
    await browser.close();
  }
}

// Bot command handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text && (text.includes('terabox.com') || text.includes('diskwala.com'))) {
    const statusMsg = await bot.sendMessage(chatId, 'Extracting video... please wait.');

    try {
      const videoUrl = await extractVideoUrl(text);
      
      // Send result as a button to prevent IP blocking on Telegram's side
      await bot.editMessageText('Video ready! Use the button below to watch:', {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        reply_markup: {
          inline_keyboard: [[
            { text: 'Watch Video', url: videoUrl }
          ]]
        }
      });
    } catch (error) {
      await bot.editMessageText(`Error: ${error.message}`, {
        chat_id: chatId,
        message_id: statusMsg.message_id
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
