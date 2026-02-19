import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    GROQ_KEY: process.env.GROQ_API_KEY,
    DISCORD_URL: "https://discord.com/api/webhooks/1474172208187445339/ILPeGeXs2MXh6wCsqPzJw7z5Pc8K6gyAHWLEvH0r8Xvy-MoOMcqTQmI0tuW6r7whB3En"
};

const PROMPT = `Return a JSON object with one interesting fun fact for adults. 
Rules: Concise, science/history/engineering focus, max 3 sentences. 
Include a "source" URL.
JSON format: {"fact": "...", "source": "..."}`;

// 10 Emergency Facts (Tier 3)
const EMERGENCY_FACTS = [
    { fact: "The Eiffel Tower can grow up to 15cm taller in summer due to thermal expansion.", source: "https://www.toureiffel.paris/en/news/history-and-culture/why-does-eiffel-tower-change-size" },
    { fact: "A single bolt of lightning contains enough energy to toast 100,000 slices of bread.", source: "https://www.weather.gov/safety/lightning-science-overview" }
];

async function postToDiscord(data) {
    console.log("📤 Sending to Discord...");
    const res = await fetch(CONFIG.DISCORD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: "Fact of the Day",
            embeds: [{
                title: "✨ Today's Fact",
                description: `${data.fact}\n\n🔗 **[Source](${data.source})**`,
                color: 0x00ff99
            }]
        })
    });
    if (res.ok) console.log("✅ Successfully posted!");
    else console.log(`❌ Discord Error: ${res.status}`);
}

async function main() {
    let finalFact = null;

    // TIER 1: GEMINI 3
    try {
        console.log("🚀 Tier 1: Trying Gemini 3 Flash...");
        const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview", tools: [{ googleSearch: {} }] });
        const result = await model.generateContent(PROMPT);
        const text = result.response.text().replace(/```json|```/g, "").trim();
        finalFact = JSON.parse(text);
    } catch (e) {
        console.log(`❌ Gemini Failed: ${e.status || e.message}`);
    }

    // TIER 2: GROQ
    if (!finalFact && CONFIG.GROQ_KEY) {
        try {
            console.log("⚡ Tier 2: Falling back to Groq (Llama 3.3)...");
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { 
                    "Authorization": `Bearer ${CONFIG.GROQ_KEY}`, 
                    "Content-Type": "application/json" 
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [{ role: "user", content: PROMPT }],
                    response_format: { type: "json_object" }
                })
            });
            const json = await response.json();
            finalFact = JSON.parse(json.choices[0].message.content);
        } catch (e) {
            console.log(`❌ Groq Failed: ${e.message}`);
        }
    }

    // TIER 3: EMERGENCY BACKUP
    if (!finalFact) {
        console.log("📦 Tier 3: All APIs failed. Using emergency backup fact...");
        finalFact = EMERGENCY_FACTS[Math.floor(Math.random() * EMERGENCY_FACTS.length)];
    }

    if (finalFact) {
        await postToDiscord(finalFact);
    } else {
        console.log("💀 Total failure: No fact generated.");
    }
}

main();
