import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    SAVE_FILE: 'current_fact.txt',
    HISTORY_FILE: 'used_facts.json',
    // 2026 Autopilot Models
    MODELS: [
        "gemini-flash-latest", // Primary (Gemini 3.1 Flash-Lite)
        "gemini-pro-latest",   // Pro Fallback
        "gemini-2.5-flash",    
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
            // Conversational text + minimalist [SOURCE] link
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
    // Check if we already ran today
    if (fs.existsSync(CONFIG.SAVE_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(CONFIG.SAVE_FILE, 'utf8'));
            if (saved.generatedDate === todayISO) {
                console.log("Already posted today. Skipping execution.");
                return;
            }
        } catch (e) {
            console.warn("Could not read save file, proceeding anyway.");
        }
    }

    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { 
            historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); 
        } catch (e) { 
            historyData = []; 
        }
    }

    // Context limit: only show the last 50 facts to the AI to prevent prompt overflow
    const usedFacts = historyData.slice(0, 50).map(h => h.eventTitle);
    
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
    
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);

    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`Attempting Fact of the Day with ${modelName}...`);
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: { response_mime_type: "application/json" }
            });

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            
            // Extract JSON with Regex safety
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const factData = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
            
            factData.generatedDate = todayISO;
            
            // Save Current State
            fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(factData, null, 2));
            
            // Update Infinite History
            historyData.unshift(factData);
            fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData, null, 2));
            
            await postToDiscord(factData);
            console.log(`Successfully posted fact using ${modelName}!`);
            return; // Exit successfully

        } catch (err) {
            console.warn(`⚠️ ${modelName} failed: ${err.message}`);
            
            // If rate limited, wait 10 seconds before fallback
            if (err.message.includes("429")) {
                console.log("Rate limit hit. Cooling down for 10s...");
                await new Promise(r => setTimeout(r, 10000));
            }

            // If this was the last model, exit with error
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
