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

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// Video extraction function for TeraBox
async function extractTeraBoxVideo(url) {
  try {
    // Fetch the TeraBox page
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    
    // Extract the video ID from the page (this is a simplified example)
    // In reality, you'd need to analyze the page structure to find the correct elements
    const videoId = $('meta[property="og:video"]').attr('content');
    
    if (!videoId) {
      throw new Error('Video not found');
    }
    
    // Construct direct video URL (this is a simplified example)
    const directUrl = `https://tera-box-proxy.com/video/${videoId}`;
    
    return directUrl;
  } catch (error) {
    console.error('Error extracting TeraBox video:', error);
    throw error;
  }
}

// Video extraction function for DiskWala
async function extractDiskWalaVideo(url) {
  try {
    // Fetch the DiskWala page
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    
    // Extract the video ID from the page (this is a simplified example)
    const videoId = $('meta[property="og:video"]').attr('content');
    
    if (!videoId) {
      throw new Error('Video not found');
    }
    
    // Construct direct video URL (this is a simplified example)
    const directUrl = `https://diskwala-proxy.com/video/${videoId}`;
    
    return directUrl;
  } catch (error) {
    console.error('Error extracting DiskWala video:', error);
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://terabox.com/'
      }
    });
    
    // Set headers for video streaming
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'inline');
    
    // Pipe the video stream to the response
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
  const webappUrl = `https://your-app-url.herokuapp.com/`;
  
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
  
  // Check if the message is a URL
  if (text && (text.includes('terabox.com') || text.includes('diskwala.com'))) {
    // Send a "processing" message
    const processingMessage = await bot.sendMessage(chatId, 'Processing your video link... This may take a moment.');
    
    try {
      // Extract video URL
      let videoUrl;
      
      if (text.includes('terabox.com')) {
        videoUrl = await extractTeraBoxVideo(text);
      } else if (text.includes('diskwala.com')) {
        videoUrl = await extractDiskWalaVideo(text);
      }
      
      // Create a streaming URL using our proxy
      const proxyUrl = `https://your-app-url.herokuapp.com/api/video-proxy?url=${encodeURIComponent(videoUrl)}`;
      
      // Edit the processing message
      await bot.editMessageText('Video extracted successfully! Sending you the video...', {
        chatId: chatId,
        messageId: processingMessage.message_id
      });
      
      // Send the video
      await bot.sendVideo(chatId, proxyUrl, {
        caption: 'Here is your video! Enjoy watching.'
      });
      
      // Delete the processing message
      await bot.deleteMessage(chatId, processingMessage.message_id);
      
    } catch (error) {
      console.error('Error processing video:', error);
      
      // Edit the processing message with an error
      await bot.editMessageText(`Error: ${error.message}`, {
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
