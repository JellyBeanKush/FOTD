import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    SAVE_FILE: 'current_fact.txt',
    HISTORY_FILE: 'used_facts.json'
};

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
    await fetch(CONFIG.DISCORD_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(discordPayload) });
}

async function main() {
    if (fs.existsSync(CONFIG.SAVE_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(CONFIG.SAVE_FILE, 'utf8'));
            if (saved.generatedDate === today) {
                await postToDiscord(saved);
                return;
            }
        } catch (e) {}
    }

    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch (e) {}
    }
    const usedEvents = historyData.map(h => h.eventTitle.toLowerCase());

    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
    const result = await model.generateContent(`Unique historical event. JSON ONLY: {"eventTitle": "Title", "description": "text", "significance": "text"}. Avoid: ${usedEvents.join(", ")}`);
    const factData = JSON.parse(result.response.text().replace(/```json|```/g, "").trim());

    if (factData) {
        factData.generatedDate = today;
        fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(factData));
        historyData.unshift(factData); 
        fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData, null, 2));
        await postToDiscord(factData);
    }
}
main();
