import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    GROQ_KEY: process.env.GROQ_API_KEY,
    DISCORD_URL: "https://discord.com/api/webhooks/1474172208187445339/ILPeGeXs2MXh6wCsqPzJw7z5Pc8K6gyAHWLEvH0r8Xvy-MoOMcqTQmI0tuW6r7whB3En"
};

const PROMPT = `Return a JSON object with one interesting fun fact for adults. 
Rules: Concise, science/history/engineering focus, max 3 sentences. 
Include a "source" URL to a reputable site.
JSON format: {"fact": "...", "source": "..."}`;

const EMERGENCY_FACTS = [
    { fact: "The world's oldest known wooden structure is a 476,000-year-old log structure found in Zambia.", source: "https://www.bbc.com/news/science-environment-66863002" },
    { fact: "A day on Venus is longer than a year on Venus; it takes 243 Earth days to rotate once.", source: "https://science.nasa.gov/venus/venus-facts/" }
];

async function postToDiscord(data) {
    console.log("📤 Posting to Discord...");
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
    if (res.ok) console.log("✅ Posted successfully!");
    else throw new Error(`Discord Error: ${res.status}`);
}

async function main() {
    let finalFact = null;

    // TIER 1: GEMINI 3 FLASH
    if (CONFIG.GEMINI_KEY) {
        try {
            console.log("🚀 Tier 1: Trying Gemini 3 Flash...");
            const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
            const model = genAI.getGenerativeModel({ 
                model: "gemini-3-flash-preview", 
                tools: [{ googleSearch: {} }] 
            });
            const result = await model.generateContent(PROMPT);
            const text = result.response.text().replace(/```json|```/g, "").trim();
            finalFact = JSON.parse(text);
        } catch (e) {
            console.log(`⚠️ Gemini 3 failed (likely 429). Error: ${e.message}`);
        }
    }

    // TIER 2: GROQ (LLAMA 3.3)
    if (!finalFact && CONFIG.GROQ_KEY) {
        try {
            console.log("⚡ Tier 2: Falling back to Groq...");
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
            console.log(`⚠️ Groq failed. Error: ${e.message}`);
        }
    }

    // TIER 3: EMERGENCY STASH
    if (!finalFact) {
        console.log("📦 Tier 3: Using internal emergency backup...");
        finalFact = EMERGENCY_FACTS[Math.floor(Math.random() * EMERGENCY_FACTS.length)];
    }

    await postToDiscord(finalFact);
}

main().catch(err => {
    console.error("💀 Fatal Script Error:", err);
    process.exit(1);
});
