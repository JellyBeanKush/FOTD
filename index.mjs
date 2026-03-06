import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    SAVE_FILE: 'current_fact.txt',
    HISTORY_FILE: 'used_facts.json',
    MODELS: [
        "gemini-1.5-flash",
        "gemini-1.5-pro"
    ]
};

const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' };
const displayDate = new Date().toLocaleDateString('en-US', options);
const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' });

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
    if (fs.existsSync(CONFIG.SAVE_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(CONFIG.SAVE_FILE, 'utf8'));
            if (saved.generatedDate === todayISO) return;
        } catch (e) {}
    }

    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch (e) {}
    }

    const usedFacts = historyData.slice(0, 50).map(h => h.eventTitle);
    const prompt = `Provide a short, mind-blowing fact. Conversational tone ("Did you know..."). Under 40 words.
    JSON ONLY: {
      "eventTitle": "Subject",
      "description": "The fact", 
      "sourceUrl": "Wikipedia URL",
      "imageUrl": "Direct .jpg/.png link from Wikipedia"
    }. Avoid: ${usedFacts.join(", ")}`;
    
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);

    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`Attempting with ${modelName}...`);
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                // Changed from response_mime_type to responseMimeType
                generationConfig: { responseMimeType: "application/json" }
            });

            const result = await model.generateContent(prompt);
            const factData = JSON.parse(result.response.text().match(/\{[\s\S]*\}/)[0]);
            
            factData.generatedDate = todayISO;
            fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(factData, null, 2));
            historyData.unshift(factData);
            fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData, null, 2));
            
            await postToDiscord(factData);
            return; 
        } catch (err) {
            console.warn(`⚠️ ${modelName} failed: ${err.message}`);
        }
    }
}

main().catch(err => {
    console.error("\n💥 Bot crashed:", err.message);
    process.exit(1);
});
