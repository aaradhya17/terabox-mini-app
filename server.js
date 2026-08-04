// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer'); // We will use Puppeteer for dynamic content
const cheerio = require('cheerio');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- IMPORTANT: Get the public URL for Railway ---
// On Railway, this environment variable is automatically set.
const PUBLIC_URL = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${PORT}`;
console.log(`App running at: ${PUBLIC_URL}`);

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

// ✅ CORRECT: Initialize bot with WEBHOOK
// This tells the library to listen for updates at the specified URL
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
const WEBHOOK_URL = `${PUBLIC_URL}/api/telegram/webhook`;

// Set the webhook
bot.setWebHook(WEBHOOK_URL).then(() => {
    console.log(`Webhook set to \${WEBHOOK_URL}`);
}).catch(err => {
    console.error('Failed to set webhook:', err);
    // Fallback to polling if webhook fails, but this is less ideal
    console.log('Falling back to polling...');
    bot.startPolling();
});


// Webhook endpoint for Railway
app.post('/api/telegram/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ✅ UPDATED: Video extraction function for TeraBox using Puppeteer
async function extractTeraBoxVideo(url) {
  let browser;
  try {
    console.log(`[Puppeteer] Launching browser to fetch: \${url}`);
    browser = await puppeteer.launch({
      headless: "new", // Use the new headless mode
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] // Important for running on Railway
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Wait for the page to load and for the network to be idle
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Extract the video URL. This is a common selector, but may need updating.
    // We look for a <video> tag or a meta tag with the video URL.
    const videoUrl = await page.evaluate(() => {
      const videoElement = document.querySelector('video source');
      if (videoElement && videoElement.src) {
        return videoElement.src;
      }
      const metaTag = document.querySelector('meta[property="og:video"]');
      if (metaTag && metaTag.content) {
        return metaTag.content;
      }
      // Try to find it in script tags as a last resort
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        if (script.textContent.includes('video_src')) {
          const match = script.textContent.match(/"video_src"\s*:\s*"([^"]+)"/);
          if (match && match[1]) {
            return match[1];
          }
        }
      }
      return null;
    });

    if (videoUrl) {
      console.log(`[Puppeteer] Found video URL: ${videoUrl}`);
      return videoUrl;
    }

    console.warn("[Puppeteer] Could not find video URL even after rendering the page.");
    throw new Error("Could not extract video URL. The site structure may have changed.");

  } catch (error) {
    console.error("[Puppeteer] Extraction Error:", error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Video extraction function for DiskWala (keeping Cheerio for now, can be updated to Puppeteer too)
async function extractDiskWalaVideo(url) {
  try {
    console.log(`Attempting to fetch: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 15000 // Increased timeout
    });

    const $ = cheerio.load(response.data);
    
    const videoMeta = $('meta[property="og:video"]').attr('content');
    
    if (videoMeta) {
      console.log("Found video meta:", videoMeta);
      return videoMeta;
    }

    console.warn("Direct video link not found in HTML. DiskWala likely requires session/cookies or JS rendering.");
    throw new Error("DiskWala requires a logged-in session or JS rendering. This simple extractor cannot bypass their security yet.");
    
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
    console.error('[API] Error extracting video:', error);
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
      },
      timeout: 30000 // 30 second timeout for streaming
    });
    
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'inline');
    response.data.pipe(res);
  } catch (error) {
    console.error('[Proxy] Error streaming video:', error);
    if (!res.headersSent) {
        res.status(500).send('Error streaming video');
    }
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
/start - Show this welcome message
/help - Show this help message
/webapp - Open the web app
  `;
  
  bot.sendMessage(chatId, welcomeMessage);
});

bot.onText(/\/webapp/, (msg) => {
  const chatId = msg.chat.id;
  // ✅ FIXED: Use PUBLIC_URL instead of req
  const webappUrl = `\${PUBLIC_URL}/`;
  
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
  
 // ... (continuing from inside bot.on('message', async (msg) => { ... })

  // Ignore commands
  if (text && text.startsWith('/')) {
    return; // Exit if it's a command
  }

  if (text && (text.includes('terabox') || text.includes('diskwala'))) {
    const processingMessage = await bot.sendMessage(chatId, '🔄 Processing your video link... This may take a moment.');
    
    try {
      let videoUrl;
      
      if (text.includes('terabox')) {
        videoUrl = await extractTeraBoxVideo(text);
      } else if (text.includes('diskwala')) {
        videoUrl = await extractDiskWalaVideo(text);
      }
      
      // ✅ FIXED: Use PUBLIC_URL instead of req
      const proxyUrl = `${PUBLIC_URL}/api/video-proxy?url=${encodeURIComponent(videoUrl)}`;
      
      await bot.editMessageText('✅ Video extracted successfully! Sending you the video...', {
        chatId: chatId,
        messageId: processingMessage.message_id
      });
      
      await bot.sendVideo(chatId, proxyUrl, {
        caption: 'Here is your video! Enjoy watching.'
      });

      // Delete the "processing" message after sending the video
      await bot.deleteMessage(chatId, processingMessage.message_id);
      
    } catch (error) {
      console.error('Error processing video:', error);
      
      // Edit the processing message with a detailed error
      await bot.editMessageText(`❌ Error: ${error.message}`, {
        chatId: chatId,
        messageId: processingMessage.message_id
      });
    }
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
   
