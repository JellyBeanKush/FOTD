import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    GROQ_KEY: process.env.GROQ_API_KEY,
    DISCORD_URL: "https://discord.com/api/webhooks/1474172208187445339/ILPeGeXs2MXh6wCsqPzJw7z5Pc8K6gyAHWLEvH0r8Xvy-MoOMcqTQmI0tuW6r7whB3En",
    HISTORY_FILE: 'used_facts.json',
    BACKUP_FILE: 'backup_facts.json'
};

const PROMPT = `Find one interesting fun fact for adults. 
TONE: Conversational, concise, English only. Max 3 sentences.
TOPIC: Science, history, or engineering. No dark/medical stuff.
SOURCE: Provide a real, working URL to a reputable source.
OUTPUT: JSON ONLY: {"fact": "text", "source": "url"}`;

// --- The Bouncer (URL Verifier) ---
async function checkUrl(url) {
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) });
        if (res.status === 404) return false;
        const text = await res.text();
        return !["page not found", "404 error"].some(m => text.toLowerCase().includes(m));
    } catch { return false; }
}

// --- Attempt 1: Gemini 3 ---
async function tryGemini() {
    console.log("🚀 Tier 1: Trying Gemini 3 Flash...");
    try {
        const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview", tools: [{ googleSearch: {} }] });
        const result = await model.generateContent(PROMPT);
        const data = JSON.parse(result.response.text().replace(/```json|```/g, "").trim());
        if (await checkUrl(data.source)) return data;
    } catch (e) { console.log(`Gemini Failed: ${e.status || e.message}`); }
    return null;
}

// --- Attempt 2: Groq (Llama 3.3) ---
async function tryGroq() {
    console.log("⚡ Tier 2: Falling back to Groq (Llama)...");
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${CONFIG.GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: PROMPT }],
                response_format: { type: "json_object" }
            })
        });
        const json = await response.json();
        const data = JSON.parse(json.choices[0].message.content);
        if (await checkUrl(data.source)) return data;
    } catch (e) { console.log(`Groq Failed: ${e.message}`); }
    return null;
}

async function main() {
    let finalFact = await tryGemini();
    
    if (!finalFact) finalFact = await tryGroq();

    if (!finalFact && fs.existsSync(CONFIG.BACKUP_FILE)) {
        console.log("📦 Tier 3: APIs down. Using local backup...");
        const backups = JSON.parse(fs.readFileSync(CONFIG.BACKUP_FILE, 'utf8'));
        finalFact = backups[Math.floor(Math.random() * backups.length)];
    }

    if (finalFact) {
        await fetch(CONFIG.DISCORD_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: "Fact of the Day",
                embeds: [{
                    title: "✨ Today's Fact",
                    description: `${finalFact.fact}\n\n🔗 **[Source](${finalFact.source})**`,
                    color: 0x00ff99
                }]
            })
        });
        console.log("Done!");
    }
}
main();
