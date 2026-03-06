import { GoogleGenAI } from "@google/genai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    SAVE_FILE: 'current_fact.txt',
    HISTORY_FILE: 'used_facts.json',
    // 2026 Ready Models
    MODELS: [
        "gemini-3.1-flash-lite-preview", 
        "gemini-3-flash-preview", 
        "gemini-1.5-flash"
    ]
};

const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' };
const displayDate = new Date().toLocaleDateString('en-US', options);
const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' });

async function postToDiscord(factData) {
    const discordPayload = {
        embeds: [{
            title: `🧠 Fact of the Day : ${displayDate}`,
            // Matching your original conversational description style
            description: `${factData.description}\n\n[SOURCE](${factData.sourceUrl})`,
            color: 0x3498db, 
            image: {
                url: factData.imageUrl 
            }
        }]
    };
    
    const response = await fetch(CONFIG.DISCORD_URL, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(discordPayload) 
    });

    if (!response.ok) {
        console.error("Discord Post Failed:", await response.text());
    }
}

async function main() {
    // 1. Check for Daily Run
    if (fs.existsSync(CONFIG.SAVE_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(CONFIG.SAVE_FILE, 'utf8'));
            if (saved.generatedDate === todayISO) {
                console.log("Already posted today. Skipping.");
                return;
            }
        } catch (e) {
            console.warn("Save file unreadable, proceeding.");
        }
    }

    // 2. Load History
    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { 
            historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); 
        } catch (e) { 
            historyData = []; 
        }
    }

    const usedFacts = historyData.slice(0, 50).map(h => h.eventTitle);
    
    const prompt = `Provide a short, mind-blowing fact. 
    Write it in a conversational, engaging tone (e.g., "Did you know..."). Keep it under 40 words.
    JSON ONLY: {
      "eventTitle": "Topic Subject",
      "description": "The conversational fact", 
      "sourceUrl": "Wikipedia URL",
      "imageUrl": "Direct high-res .jpg or .png link from that Wikipedia page"
    }. 
    CRITICAL: imageUrl MUST be a direct file link for Discord.
    DO NOT use these topics: ${usedFacts.join(", ")}`;
    
    const client = new GoogleGenAI({ apiKey: CONFIG.GEMINI_KEY });

    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`Attempting Fact of the Day with ${modelName}...`);
            
            // Fixed field: responseMimeType (CamelCase for 2026 SDK)
            const result = await client.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    thinkingConfig: { thinkingLevel: "minimal" }
                }
            });

            const responseText = result.text;
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const factData = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
            
            factData.generatedDate = todayISO;
            
            // 3. Save Files
            fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(factData, null, 2));
            historyData.unshift(factData);
            fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData, null, 2));
            
            // 4. Post
            await postToDiscord(factData);
            console.log(`Success using ${modelName}!`);
            return; 

        } catch (err) {
            console.warn(`⚠️ ${modelName} failed: ${err.message}`);
            
            if (err.message.includes("429")) {
                await new Promise(r => setTimeout(r, 10000));
            }

            if (modelName === CONFIG.MODELS[CONFIG.MODELS.length - 1]) {
                throw new Error("TOTAL FAILURE: All models exhausted.");
            }
        }
    }
}

main().catch(err => {
    console.error("\n💥 Bot crashed:", err.message);
    process.exit(1);
});
