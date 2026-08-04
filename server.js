// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Serve static files for the mini app
app.use(express.static(path.join(__dirname, 'public')));

// Telegram Bot Token from environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN is not set in environment variables');
  process.exit(1);
}

// ✅ CORRECT: Initialize bot ONLY ONCE, before any usage
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);

// Webhook endpoint for Railway
app.post('/api/telegram/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Video extraction function for TeraBox
async function extractTeraBoxVideo(url) {
  try {
    console.log(`Attempting to fetch: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    
    const videoMeta = $('meta[property="og:video"]').attr('content');
    
    if (videoMeta) {
      console.log("Found video meta:", videoMeta);
      return videoMeta;
    }

    console.warn("Direct video link not found in HTML. TeraBox likely requires session/cookies.");
    throw new Error("TeraBox requires a logged-in session to extract video links. This simple extractor cannot bypass their security yet.");
    
  } catch (error) {
    console.error("Extraction Error:", error.message);
    throw error;
  }
}

// Video extraction function for DiskWala
async function extractDiskWalaVideo(url) {
  try {
    console.log(`Attempting to fetch: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    
    const videoMeta = $('meta[property="og:video"]').attr('content');
    
    if (videoMeta) {
      console.log("Found video meta:", videoMeta);
      return videoMeta;
    }

    console.warn("Direct video link not found in HTML. DiskWala likely requires session/cookies.");
    throw new Error("DiskWala requires a logged-in session to extract video links. This simple extractor cannot bypass their security yet.");
    
  } catch (error) {
    console.error("Extraction Error:", error.message);
    throw error;
  }
}

// API endpoint to extract video URL
app.get('/api/extract-video', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  
  try {
    let videoUrl;
    
    if (url.includes('terabox')) {
      videoUrl = await extractTeraBoxVideo(url);
    } else if (url.includes('diskwala')) {
      videoUrl = await extractDiskWalaVideo(url);
    } else {
      return res.status(400).json({ error: 'Unsupported URL' });
    }
    
    res.json({ videoUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Proxy endpoint for streaming videos
app.get('/api/video-proxy', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).send('URL is required');
  }
  
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://terabox.com/'
      }
    });
    
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'inline');
    response.data.pipe(res);
  } catch (error) {
    console.error('Error streaming video:', error);
    res.status(500).send('Error streaming video');
  }
});

// Serve the mini app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Bot command handlers
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `
Welcome to the Video Streaming Bot!

I can help you watch videos from TeraBox or DiskWala directly without using their apps.

Simply send me a TeraBox or DiskWala video link, and I'll extract it for you to watch.

Commands:
/help - Show this help message
/terms - Terms of service
/webapp - Open the web app
  `;
  
  bot.sendMessage(chatId, welcomeMessage);
});

bot.onText(/\/webapp/, (msg) => {
  const chatId = msg.chat.id;
  // Use dynamic URL based on the request
  const webappUrl = `${req.protocol}://${req.get('host')}/`;
  
  bot.sendMessage(chatId, 'Open the web app:', {
    reply_markup: {
      inline_keyboard: [[
        { text: 'Open Video Streamer', web_app: { url: webappUrl } }
      ]]
    }
  });
});

// Handle incoming messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (text && (text.includes('terabox') || text.includes('diskwala'))) {
    try {
      const processingMessage = await bot.sendMessage(chatId, 'Processing your video link... This may take a moment.');
      
      let videoUrl;
      
      if (text.includes('terabox')) {
        videoUrl = await extractTeraBoxVideo(text);
      } else if (text.includes('diskwala')) {
        videoUrl = await extractDiskWalaVideo(text);
      }
      
      const proxyUrl = `${req.protocol}://${req.get('host')}/api/video-proxy?url=\${encodeURIComponent(videoUrl)}`;
      
      await bot.editMessageText('Video extracted successfully! Sending you the video...', {
        chatId: chatId,
        messageId: processingMessage.message_id
      });
      
      await bot.sendVideo(chatId, proxyUrl, {
        caption: 'Here is your video! Enjoy watching.'
      });
