// ... (keep all your imports and setup) ...

// UPDATED: Robust Extraction Function
async function extractTeraBoxVideo(url) {
  try {
    console.log(`Attempting to fetch: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 10000 // 10 second timeout
    });

    const $ = cheerio.load(response.data);
    
    // TeraBox often doesn't have og:video. We need to look for script tags or API calls.
    // This is a simplified check. In production, you'd need to parse the JS or use a proxy.
    // For now, let's look for any video link in the page source just in case.
    const videoMeta = $('meta[property="og:video"]').attr('content');
    
    if (videoMeta) {
      console.log("Found video meta:", videoMeta);
      return videoMeta;
    }

    // If not found, TeraBox usually requires a session. 
    // We will return a placeholder or throw a specific error to handle in UI.
    // For this demo, we will simulate a "success" with a dummy link to test the UI flow,
    // BUT in reality, this will fail to play.
    
    console.warn("Direct video link not found in HTML. TeraBox likely requires session/cookies.");
    
    // OPTION: Throw a specific error so your UI can show a helpful message
    throw new Error("TeraBox requires a logged-in session to extract video links. This simple extractor cannot bypass their security yet.");
    
  } catch (error) {
    console.error("Extraction Error:", error.message);
    throw error; // Re-throw so the API catches it
  }
}

// ... (keep the rest of your API and Bot logic) ...

// UPDATED: Bot Message Handler with Better Error Handling
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text && (text.includes('terabox') || text.includes('diskwala'))) {
    try {
      const processingMsg = await bot.sendMessage(chatId, 'Processing your link...');
      
      let videoUrl;
      if (text.includes('terabox')) {
        videoUrl = await extractTeraBoxVideo(text);
      } else {
        videoUrl = await extractDiskWalaVideo(text);
      }

      const proxyUrl = `${req.protocol}://${req.get('host')}/api/video-proxy?url=${encodeURIComponent(videoUrl)}`;
      
      await bot.editMessageText('Video found! Sending...', { chatId, messageId: processingMsg.message_id });
      await bot.sendVideo(chatId, proxyUrl, { caption: 'Here is your video' });
      await bot.deleteMessage(chatId, processingMsg.message_id);

    } catch (err) {
      console.error("Bot Error:", err);
      await bot.editMessageText(`❌ Error: ${err.message}`, { chatId, messageId: msg.message_id }); // Or use processingMsg if you kept it
    }
  }
});
