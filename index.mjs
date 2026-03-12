import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    SAVE_FILE: 'current_fact.txt',
    HISTORY_FILE: 'used_facts.json',
    MODELS: [
        "gemini-3.1-flash-lite-preview", 
        "gemini-3-flash-preview", 
        "gemini-2.5-flash"
    ]
};

const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' };
const displayDate = new Date().toLocaleDateString('en-US', options);
const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' });

// Function to fetch a truly random Wikipedia topic
async function getRandomTopic() {
    try {
        // This fetches the "On This Day" and "Featured" articles for today
        const response = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/featured/${new Date().getFullYear()}/${(new Date().getMonth() + 1).toString().padStart(2, '0')}/${new Date().getDate().toString().padStart(2, '0')}`);
        const data = await response.json();
        
        // Pick from 'onthisday' (events), 'tfa' (today's featured article), or 'mostread'
        const source = data.onthisday ? data.onthisday[Math.floor(Math.random() * data.onthisday.length)] : data.tfa;
        
        // Sometimes "onthisday" returns multiple pages, we'll take the first relevant one
        const page = source.pages ? source.pages[0] : source;

        return { 
            title: page.title, 
            url: page.content_urls.desktop.page,
            thumbnail: page.thumbnail ? page.thumbnail.source : null 
        };
    } catch (e) {
        console.error("Wiki Feed Fetch Failed:", e);
        return { title: "The Great Emu War", url: "https://en.wikipedia.org/wiki/Emu_War" };
    }
}

async function postToDiscord(factData) {
    const discordPayload = {
        embeds: [{
            title: `🧠 Fact of the Day : ${displayDate}`,
            description: `${factData.description}\n\n[SOURCE](${factData.sourceUrl})`,
            color: 0x3498db, 
            image: { url: factData.imageUrl }
        }]
    };
    
    const response = await fetch(CONFIG.DISCORD_URL, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(discordPayload) 
    });

    if (!response.ok) console.error("Discord Post Failed:", await response.text());
}

async function main() {
    // 1. Skip if we already posted today
    if (fs.existsSync(CONFIG.SAVE_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(CONFIG.SAVE_FILE, 'utf8'));
            if (saved.generatedDate === todayISO) return;
        } catch (e) {}
    }

    // 2. Load history and get a random topic from Wikipedia
    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch (e) {}
    }
    
    const usedTitles = historyData.slice(0, 100).map(h => h.eventTitle.toLowerCase());
    const wikiTopic = await getRandomTopic();

    // 3. Craft a prompt that forces the AI to use the specific Wiki topic
    const prompt = `
  Context: You are a curator for a "Fact of the Day" bot. Your audience loves the weird, the obscure, and the slightly unsettling.
  
  Topic: "${wikiTopic.title}" (Link: ${wikiTopic.url})
  
  Task:
  1. Research this specific topic. 
  2. Find a "deep cut" fact. 
  3. Avoid cliché "did you know" facts (e.g., no mention of the moon, basic history dates, or common science facts).
  4. If the topic is boring, find a weird connection to a more interesting sub-topic within that page.

  Format: JSON ONLY
  {
    "eventTitle": "${wikiTopic.title}",
    "description": "Short, punchy fact (max 45 words). Use a conversational, slightly witty tone.",
    "sourceUrl": "${wikiTopic.url}",
    "imageUrl": "${wikiTopic.thumbnail || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3"}" 
  }
`;
    
    Avoid subjects in this list: ${usedTitles.join(", ")}`;
    
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);

    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`Attempting with ${modelName} using topic: ${wikiTopic.title}...`);
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
            });

            const result = await model.generateContent(prompt);
            const rawText = result.response.text().match(/\{[\s\S]*\}/)[0];
            const factData = JSON.parse(rawText);

            // Validation: Check if AI hallucinated a duplicate despite our specific Wiki topic
            if (usedTitles.includes(factData.eventTitle.toLowerCase())) {
                throw new Error(`Duplicate topic: ${factData.eventTitle}`);
            }
            
            factData.generatedDate = todayISO;
            fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(factData, null, 2));
            
            historyData.unshift(factData);
            fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData, null, 2));
            
            await postToDiscord(factData);
            console.log("Success! Posted to Discord.");
            return; 
        } catch (err) {
            console.warn(`⚠️ ${modelName} failed or produced duplicate: ${err.message}`);
        }
    }
}

main().catch(err => {
    console.error("\n💥 Bot crashed:", err.message);
    process.exit(1);
});
