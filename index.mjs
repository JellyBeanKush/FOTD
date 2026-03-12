import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    SAVE_FILE: 'current_fact.txt',
    HISTORY_FILE: 'used_facts.json',
    MODELS: [
        "gemini-2.0-flash", // Using the latest stable flash models
        "gemini-1.5-flash"
    ]
};

const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' };
const displayDate = new Date().toLocaleDateString('en-US', options);
const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' });

/**
 * Fetches a high-quality topic from Wikipedia's Featured Feed.
 * This avoids "stubs" and boring dictionary definitions.
 */
async function getFeaturedTopic() {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        
        const url = `https://en.wikipedia.org/api/rest_v1/feed/featured/${year}/${month}/${day}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("Wiki Feed not available");
        
        const data = await response.json();
        
        // Prioritize "On This Day", then "Today's Featured Article"
        let selection;
        if (data.onthisday && data.onthisday.length > 0) {
            selection = data.onthisday[Math.floor(Math.random() * data.onthisday.length)];
        } else {
            selection = data.tfa;
        }

        const page = selection.pages ? selection.pages[0] : selection;

        return {
            title: page.title,
            url: page.content_urls.desktop.page,
            thumbnail: page.thumbnail ? page.thumbnail.source : null,
            extract: page.extract // Give the AI some context to work with
        };
    } catch (e) {
        console.error("Wiki Fetch Failed, using backup:", e);
        return { 
            title: "The Great Emu War", 
            url: "https://en.wikipedia.org/wiki/Emu_War",
            extract: "A nuisance wildlife management military operation undertaken in Australia in 1932."
        };
    }
}

async function postToDiscord(factData) {
    const discordPayload = {
        embeds: [{
            title: `🧠 Fact of the Day: ${displayDate}`,
            description: `${factData.description}\n\n**[READ MORE](${factData.sourceUrl})**`,
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
    // 1. Prevent duplicate runs today
    if (fs.existsSync(CONFIG.SAVE_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(CONFIG.SAVE_FILE, 'utf8'));
            if (saved.generatedDate === todayISO) {
                console.log("Already posted today. Skipping.");
                return;
            }
        } catch (e) {}
    }

    // 2. Load history and get topic
    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch (e) {}
    }
    
    const usedTitles = historyData.slice(0, 50).map(h => h.eventTitle.toLowerCase());
    const wikiTopic = await getFeaturedTopic();

    // 3. Prompt Engineering
    const prompt = `
        Task: Provide a mind-blowing, conversational fact about the Wikipedia topic: "${wikiTopic.title}".
        Context: ${wikiTopic.extract}
        
        Rules:
        - Tone: Surprising, fun, slightly witty.
        - Obscurity: Don't give the most obvious fact. Find a "deep cut."
        - Avoid these previous topics: ${usedTitles.join(", ")}
        - Length: Under 45 words.

        JSON ONLY:
        {
          "eventTitle": "${wikiTopic.title}",
          "description": "The surprising fact here",
          "sourceUrl": "${wikiTopic.url}",
          "imageUrl": "${wikiTopic.thumbnail || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3"}"
        }`;
    
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);

    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`Attempting with ${modelName} using topic: ${wikiTopic.title}...`);
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
            });

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            const factData = JSON.parse(responseText);

            if (usedTitles.includes(factData.eventTitle.toLowerCase())) {
                throw new Error(`Duplicate topic: ${factData.eventTitle}`);
            }
            
            factData.generatedDate = todayISO;
            fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(factData, null, 2));
            
            historyData.unshift(factData);
            fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData.slice(0, 100), null, 2));
            
            await postToDiscord(factData);
            console.log("Success! Posted to Discord.");
            return; 
        } catch (err) {
            console.warn(`⚠️ ${modelName} failed: ${err.message}`);
        }
    }
}

main().catch(err => {
    console.error("\n💥 Bot crashed!");
    console.error(err);
    process.exit(1);
});
