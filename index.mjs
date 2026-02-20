import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    SAVE_FILE: 'current_fact.txt',
    HISTORY_FILE: 'fact_history.json',
    PRIMARY_MODEL: "gemini-3-flash-preview", 
    BACKUP_MODEL: "gemini-2.0-flash" 
};

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' });

async function postToDiscord(factData) {
    const discordPayload = {
        embeds: [{
            title: "Did You Know?",
            description: factData.fact,
            color: 0x3498db, 
            footer: {
                text: `Source: Wikipedia • ${factData.topic}`
            },
            url: factData.sourceUrl
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
    
    // FIX: Explicitly forcing the SDK to look in the v1beta endpoint for the new models
    const model = genAI.getGenerativeModel(
        { model: modelName }, 
        { apiVersion: 'v1beta' }
    );

    for (let i = 0; i < retries; i++) {
        try {
            const result = await model.generateContent(prompt);
            return result.response.text().replace(/```json|```/g, "").trim();
        } catch (error) {
            if (error.message.includes("503") || error.message.includes("429")) {
                console.log(`Model ${modelName} busy/throttled. Retry ${i + 1}/3...`);
                // Bumping the wait to 10 seconds to better clear rate limits
                await new Promise(r => setTimeout(r, 10000));
            } else { throw error; }
        }
    }
    throw new Error(`All retries failed for ${modelName}`);
}

async function main() {
    if (fs.existsSync(CONFIG.SAVE_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(CONFIG.SAVE_FILE, 'utf8'));
            if (saved.generatedDate === today) {
                console.log("Fact already posted today.");
                return;
            }
        } catch (e) {}
    }

    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch (e) {}
    }
    const usedTopics = historyData.slice(0, 30).map(h => h.topic);

    const prompt = `Provide a mind-blowing fact. JSON ONLY: {"fact": "text", "topic": "Subject", "sourceUrl": "Wikipedia URL"}. DO NOT use: ${usedTopics.join(", ")}`;
    
    let responseText;
    try {
        console.log(`Attempting ${CONFIG.PRIMARY_MODEL}...`);
        responseText = await generateWithRetry(CONFIG.PRIMARY_MODEL, prompt);
    } catch (e) {
        console.log(`Primary failed (${e.message}). Switching to ${CONFIG.BACKUP_MODEL}...`);
        responseText = await generateWithRetry(CONFIG.BACKUP_MODEL, prompt);
    }

    try {
        const factData = JSON.parse(responseText);
        factData.generatedDate = today;
        
        fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(factData));
        historyData.unshift(factData);
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData.slice(0, 50), null, 2));
        
        await postToDiscord(factData);
        console.log("Fact posted successfully!");
    } catch (err) {
        console.error("Critical Error:", err.message);
        process.exit(1);
    }
}

main();
