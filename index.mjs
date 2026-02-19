import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    GROQ_KEY: process.env.GROQ_API_KEY,
    DISCORD_URL: "https://discord.com/api/webhooks/YOUR_WEBHOOK_URL"
};

const PROMPT = `Generate one interesting, verifiable fun fact for adults. 
Science/History focus. Max 3 sentences. 
JSON ONLY: {"fact": "text", "source": "url"}`;

// Tier 3: Internal Safety Net
const EMERGENCY_FACTS = [
    { fact: "The 'Eiffel Tower' can grow 15cm taller in summer due to thermal expansion.", source: "https://www.toureiffel.paris/en/news/history-and-culture/why-does-eiffel-tower-change-size" },
    { fact: "A single bolt of lightning can toast 100,000 slices of bread.", source: "https://www.weather.gov/safety/lightning-science-overview" }
];

async function checkUrl(url) {
    try {
        const res = await fetch(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(5000) 
        });
        // 404 means the AI hallucinated the link; 403/headers mean it's just a bot block
        return res.status !== 404; 
    } catch { return false; }
}

async function main() {
    let finalFact = null;

    // TIER 1: Gemini 3 Flash
    try {
        console.log("🚀 Tier 1: Gemini 3...");
        const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview", tools: [{ googleSearch: {} }] });
        const result = await model.generateContent(PROMPT);
        const data = JSON.parse(result.response.text().replace(/```json|```/g, ""));
        if (await checkUrl(data.source)) finalFact = data;
    } catch (e) { console.log(`Tier 1 Skip: ${e.message}`); }

    // TIER 2: Groq Fallback
    if (!finalFact && CONFIG.GROQ_KEY) {
        try {
            console.log("⚡ Tier 2: Groq...");
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${CONFIG.GROQ_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [{ role: "user", content: PROMPT }],
                    response_format: { type: "json_object" }
                })
            });
            const json = await res.json();
            finalFact = JSON.parse(json.choices[0].message.content);
        } catch (e) { console.log(`Tier 2 Skip: ${e.message}`); }
    }

    // TIER 3: Emergency Backup
    if (!finalFact) {
        console.log("📦 Tier 3: Local Stash...");
        finalFact = EMERGENCY_FACTS[Math.floor(Math.random() * EMERGENCY_FACTS.length)];
    }

    // Post to Discord
    await fetch(CONFIG.DISCORD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            embeds: [{ title: "✨ Daily Fact", description: `${finalFact.fact}\n\n[Source](${finalFact.source})`, color: 0x00ff99 }]
        })
    });
}
main();
