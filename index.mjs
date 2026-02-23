import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    SAVE_FILE: 'current_fact.txt',
    HISTORY_FILE: 'used_facts.json',
    PRIMARY_MODEL: "gemini-1.5-flash", 
    BACKUP_MODEL: "gemini-1.5-flash" 
};

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' });

async function postToDiscord(factData) {
    const discordPayload = {
        embeds: [{
            title: `📌 ${factData.eventTitle}`,
            description: factData.description,
            color: 0x3498db, 
            fields: [
                { name: "Significance", value: factData.significance }
            ],
            footer: {
                text: `Source: Wikipedia • Generated on ${today}`
            },
            url: factData.sourceUrl || "https://wikipedia.org"
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
            if (error.message.includes("503") || error.message.includes("429")) {
                console.log(`Model ${modelName} busy. Retry ${i + 1}/3...`);
                await new Promise(r => setTimeout(r, 10000));
            } else { throw error; }
        }
    }
    throw new Error(`All retries failed for ${modelName}`);
}

async function main() {
    // 1. Check if we already ran today
    if (fs.existsSync(CONFIG.SAVE_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(CONFIG.SAVE_FILE, 'utf8'));
            if (saved.generatedDate === today) {
                console.log("Fact already posted today.");
                return;
            }
        } catch (e) { console.log("Creating new save file..."); }
    }

    // 2. Load History
    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { 
            historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); 
        } catch (e) { console.log("History file empty or corrupted."); }
    }

    // 3. Prepare Prompt (exclude previous titles)
    const usedTitles = historyData.slice(0, 40).map(h => h.eventTitle);
    const prompt = `Provide a mind-blowing fact. 
    JSON ONLY: {"eventTitle": "Title", "description": "Short description", "significance": "Why it matters", "sourceUrl": "Wikipedia URL"}. 
    DO NOT use these topics: ${usedTitles.join(", ")}`;
    
    let responseText;
    try {
        console.log(`Attempting ${CONFIG.PRIMARY_MODEL}...`);
        responseText = await generateWithRetry(CONFIG.PRIMARY_MODEL, prompt);
    } catch (e) {
        console.log(`Primary failed. Switching to ${CONFIG.BACKUP_MODEL}...`);
        responseText = await generateWithRetry(CONFIG.BACKUP_MODEL, prompt);
    }

    // 4. Parse, Save, and Post
    try {
        const factData = JSON.parse(responseText);
        factData.generatedDate = today;
        
        // Save current for check
        fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(factData));
        
        // Update history
        historyData.unshift(factData);
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData.slice(0, 100), null, 2));
        
        await postToDiscord(factData);
        console.log("Fact posted and history updated!");
    } catch (err) {
        console.error("Critical Error:", err.message);
        process.exit(1);
    }
}

main();
