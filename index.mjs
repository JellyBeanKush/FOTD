import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: "https://discord.com/api/webhooks/1474172208187445339/ILPeGeXs2MXh6wCsqPzJw7z5Pc8K6gyAHWLEvH0r8Xvy-MoOMcqTQmI0tuW6r7whB3En",
    SAVE_FILE: 'current_fact.txt',
    HISTORY_FILE: 'used_facts.json'
};

// Standardized YYYY-MM-DD for Oregon time
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' });

async function postToDiscord(factData) {
    const discordPayload = {
        username: "Fact of the Day",
        embeds: [{
            title: `📅 ON THIS DAY: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' })}`,
            description: `## **${factData.eventTitle}**\n\n> ${factData.description}\n\n**Historical Significance**\n${factData.significance}`,
            color: 0x3498db 
        }]
    };
    await fetch(CONFIG.DISCORD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordPayload)
    });
}

async function main() {
    // 1. REPOST CHECK
    if (fs.existsSync(CONFIG.SAVE_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(CONFIG.SAVE_FILE, 'utf8'));
            if ((saved.generatedDate || saved.date) === today) {
                console.log(`♻️ Fact for ${today} found. Updating Discord...`);
                await postToDiscord(saved);
                return;
            }
        } catch (e) { console.log("Initializing new JSON format..."); }
    }

    // 2. LOAD HISTORY
    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try {
            historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8'));
        } catch (e) { console.log("History file initialized."); }
    }
    const usedEvents = historyData.map(h => h.eventTitle.toLowerCase());

    // 3. GENERATE NEW FACT
    console.log(`🚀 No fact found for ${today}. Generating...`);
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const PROMPT = `Provide a unique, fascinating historical event for this calendar day. 
    JSON ONLY: {
      "eventTitle": "Short Title",
      "description": "2-3 sentence engaging description.",
      "significance": "Why it matters."
    }`;
    
    const result = await model.generateContent(PROMPT + ` Avoid these topics: ${usedEvents.join(", ")}`);
    const factData = JSON.parse(result.response.text().replace(/```json|```/g, "").trim());

    if (factData) {
        factData.generatedDate = today;
        fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(factData));
        
        historyData.unshift(factData); 
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData, null, 2));
        
        await postToDiscord(factData);
        console.log(`✅ Fact posted: ${factData.eventTitle}`);
    }
}
main();
