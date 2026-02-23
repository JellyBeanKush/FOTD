import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    SAVE_FILE: 'current_fact.txt',
    HISTORY_FILE: 'used_facts.json',
    PRIMARY_MODEL: "gemini-2.5-flash", 
    BACKUP_MODEL: "gemini-2.0-flash-latest" 
};

const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' };
const displayDate = new Date().toLocaleDateString('en-US', options);
const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' });

async function postToDiscord(factData) {
    const discordPayload = {
        embeds: [{
            title: `🧠 Fact of the Day : ${displayDate}`,
            // Conversational text + minimalist [SOURCE] link
            description: `${factData.description}\n\n[SOURCE](${factData.sourceUrl})`,
            color: 0x3498db, 
            image: {
                url: factData.imageUrl 
            }
        }]
    };
    
    await fetch(CONFIG.DISCORD_URL, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(discordPayload) 
    });
}

async function generateWithRetry(modelName, prompt, retries = 3) {
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: modelName });

    for (let i = 0; i < retries; i++) {
        try {
            const result = await model.generateContent(prompt);
            const text = result.response.text().replace(/```json|```/g, "").trim();
            return text;
        } catch (error) {
            if (i < retries - 1) await new Promise(r => setTimeout(r, 5000));
            else throw error;
        }
    }
}

async function main() {
    if (fs.existsSync(CONFIG.SAVE_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(CONFIG.SAVE_FILE, 'utf8'));
            if (saved.generatedDate === todayISO) {
                console.log("Already posted today.");
                return;
            }
        } catch (e) {}
    }

    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch (e) {}
    }

    const usedFacts = historyData.slice(0, 50).map(h => h.eventTitle);
    
    // Prompt adjusted for conversational tone and better image links
    const prompt = `Provide a short, mind-blowing fact. 
    Write it in a conversational, engaging tone (e.g., "Did you know..."). Keep it under 40 words.
    JSON ONLY: {
      "eventTitle": "Topic Subject",
      "description": "The conversational fact", 
      "sourceUrl": "Wikipedia URL",
      "imageUrl": "Direct high-res .jpg or .png link from that Wikipedia page"
    }. 
    CRITICAL: imageUrl MUST be a direct file link so Discord can display it.
    DO NOT include 'significance' or an extra title.
    DO NOT use these topics: ${usedFacts.join(", ")}`;
    
    let responseText;
    try {
        responseText = await generateWithRetry(CONFIG.PRIMARY_MODEL, prompt);
    } catch (e) {
        responseText = await generateWithRetry(CONFIG.BACKUP_MODEL, prompt);
    }

    try {
        const factData = JSON.parse(responseText);
        factData.generatedDate = todayISO;
        
        fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(factData));
        historyData.unshift(factData);
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData.slice(0, 100), null, 2));
        
        await postToDiscord(factData);
        console.log("Conversational fact posted!");
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
}

main();
