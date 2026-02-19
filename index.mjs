import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

// This now pulls safely from your GitHub Secrets
const GEMINI_KEY = process.env.GEMINI_API_KEY; 
const WEBHOOK_URL = "https://discord.com/api/webhooks/1474172208187445339/ILPeGeXs2MXh6wCsqPzJw7z5Pc8K6gyAHWLEvH0r8Xvy-MoOMcqTQmI0tuW6r7whB3En";
const HISTORY_FILE = 'used_facts.json';
const CURRENT_FILE = 'current_fact.txt';

const genAI = new GoogleGenerativeAI(GEMINI_KEY);

async function checkUrl(url) {
    try {
        const response = await fetch(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml'
            },
            signal: AbortSignal.timeout(8000)
        });

        if (!response.ok && response.status !== 403) return false;

        const bodyText = await response.text();
        const lowerText = bodyText.toLowerCase();
        const soft404Markers = ["page not found", "404 error", "couldn't find that page", "article not found"];
        
        if (soft404Markers.some(marker => lowerText.includes(marker))) return false;

        return true; 
    } catch (error) {
        return false;
    }
}

async function main() {
    // If the secret isn't set, we stop early with a clear message
    if (!GEMINI_KEY) {
        console.error("Missing GEMINI_API_KEY secret in GitHub!");
        process.exit(1);
    }

    try {
        let history = [];
        if (fs.existsSync(HISTORY_FILE)) {
            try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch (e) { history = []; }
        }

        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash", // Reverting to 1.5 Flash as it's the stable grounded version
            tools: [{ googleSearch: {} }] 
        });

        let validData = null;
        let attempts = 0;

        while (!validData && attempts < 5) {
            attempts++;
            console.log(`Attempt ${attempts}: Generating grounded fact...`);

            const prompt = `Find one interesting fun fact for adults. 
            TONE: Conversational, concise, natural English.
            RULES: Max 3 sentences. No gross, dark, or cutesy topics.
            SOURCE: Provide a real, working URL to a reputable source. 
            UNIQUE: Avoid: ${history.slice(-15).join(', ')}.
            OUTPUT: JSON ONLY: {"fact": "text", "source": "url"}`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            let text = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
            const data = JSON.parse(text);

            if (await checkUrl(data.source)) {
                validData = data;
            } else {
                console.log(`Link failed: ${data.source}. Retrying...`);
            }
        }

        if (!validData) process.exit(1);

        history.push(validData.fact);
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        fs.writeFileSync(CURRENT_FILE, validData.fact); 

        await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: "Fact of the Day",
                avatar_url: "https://i.imgur.com/8nLFCvp.png",
                embeds: [{
                    title: "✨ Today's Fact",
                    description: `${validData.fact}\n\n🔗 **[Source](${validData.source})**`,
                    color: 0x00ff99
                }]
            })
        });

        console.log("Success!");
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}
main();
