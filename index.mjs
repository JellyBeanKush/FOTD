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

// Formatting date for the header: Month, Date, Year
const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' };
const displayDate = new Date().toLocaleDateString('en-US', options);
const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' });

async function postToDiscord(factData) {
    const sourceName = factData.sourceUrl.includes("wikipedia.org") ? "Wikipedia" : "Source";

    const discordPayload = {
        embeds: [{
            // Header updated to Fact of the Day : Month, Date, Year
            title: `🧠 Fact of the Day : ${displayDate}`,
            // We moved the specific fact title into the description for better visibility
            description: `**${factData.eventTitle}**\n\n${factData.description}\n\n[Source: ${sourceName}](${factData.sourceUrl})`,
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
            console.log(`Error with ${modelName}: ${error.message}`);
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
                console.log("Fact already posted today.");
                return;
            }
        } catch (e) {}
    }

    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch (e) {}
    }

    const usedTitles = historyData.slice(0, 50).map(h => h.eventTitle);
    
    // Prompt updated for image reliability and removed significance
    const prompt = `Provide a mind-blowing fact. 
    JSON ONLY: {
      "eventTitle": "Fact Subject Title", 
      "description": "The fact in 1-2 sentences", 
      "sourceUrl": "Wikipedia URL",
      "imageUrl": "DIRECT link to a high-res .jpg or .png image from the Wikipedia page"
    }. 
    CRITICAL: Ensure the imageUrl ends in .jpg, .png, or .webp so Discord can render it.
    DO NOT include 'significance'.
    DO NOT use these topics: ${usedTitles.join(", ")}`;
    
    let responseText;
    try {
        console.log(`Attempting ${CONFIG.PRIMARY_MODEL}...`);
        responseText = await generateWithRetry(CONFIG.PRIMARY_MODEL, prompt);
    } catch (e) {
        console.log(`Primary failed. Switching to ${CONFIG.BACKUP_MODEL}...`);
        responseText = await generateWithRetry(CONFIG.BACKUP_MODEL, prompt);
    }

    try {
        const factData = JSON.parse(responseText);
        factData.generatedDate = todayISO;
        
        fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(factData));
        historyData.unshift(factData);
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData.slice(0, 100), null, 2));
        
        await postToDiscord(factData);
        console.log("Success! Posted with New Header and Image.");
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
}

main();
