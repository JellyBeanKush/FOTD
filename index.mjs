import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    GROQ_KEY: process.env.GROQ_API_KEY,
    // Using your hardcoded URL as fallback if secret isn't set
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL || "https://discord.com/api/webhooks/1474172208187445339/ILPeGeXs2MXh6wCsqPzJw7z5Pc8K6gyAHWLEvH0r8Xvy-MoOMcqTQmI0tuW6r7whB3En"
};

const PROMPT = `Return a JSON object with one interesting fun fact for adults. JSON ONLY: {"fact": "text", "source": "url"}`;

const EMERGENCY_FACTS = [
    { fact: "The world's oldest known wooden structure is a 476,000-year-old log structure found in Zambia.", source: "https://www.bbc.com/news/science-environment-66863002" },
    { fact: "A day on Venus is longer than a year on Venus; it takes 243 Earth days to rotate once.", source: "https://science.nasa.gov/venus/venus-facts/" }
];

async function postToDiscord(data) {
    console.log("📤 Attempting to post to Discord...");
    try {
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
        console.log(res.ok ? "✅ POST SUCCESSFUL" : `❌ DISCORD REJECTED: ${res.status}`);
    } catch (err) {
        console.error("💀 DISCORD NETWORK ERROR:", err.message);
    }
}

async function main() {
    let finalFact = null;

    // TIER 1: GEMINI
    if (CONFIG.GEMINI_KEY) {
        try {
            console.log("🚀 Tier 1: Gemini 3...");
            const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview", tools: [{ googleSearch: {} }] });
            const result = await model.generateContent(PROMPT);
            const text = result.response.text().replace(/```json|```/g, "").trim();
            finalFact = JSON.parse(text);
            console.log("✅ Gemini Fact Acquired");
        } catch (e) {
            console.log(`⚠️ Gemini Failed: ${e.message}`);
        }
    } else {
        console.log("⏩ Skipping Gemini: No Key Found");
    }

    // TIER 2: GROQ
    if (!finalFact && CONFIG.GROQ_KEY) {
        try {
            console.log("⚡ Tier 2: Groq...");
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
            if (json.choices && json.choices[0]) {
                finalFact = JSON.parse(json.choices[0].message.content);
                console.log("✅ Groq Fact Acquired");
            }
        } catch (e) {
            console.log(`⚠️ Groq Failed: ${e.message}`);
        }
    } else if (!finalFact) {
        console.log("⏩ Skipping Groq: No Key Found");
    }

    // TIER 3: EMERGENCY
    if (!finalFact) {
        console.log("📦 Tier 3: Using internal emergency backup...");
        finalFact = EMERGENCY_FACTS[Math.floor(Math.random() * EMERGENCY_FACTS.length)];
    }

    await postToDiscord(finalFact);
}

main();
