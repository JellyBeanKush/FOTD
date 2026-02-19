import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const GEMINI_KEY = "AIzaSyBZn2tHx2jtpKHZgCRs6H8PxwQj9FAPn6w"; 
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
        // Catch those annoying "Page Not Found" screens that pretend to be a success
        const soft404Markers = ["page not found", "404 error", "couldn't find that page", "article not found"];
        
        if (soft404Markers.some(marker => lowerText.includes(marker))) {
            return false;
        }

        return true; 
    } catch (error) {
        return false;
    }
}

async function main() {
    try {
        let history = [];
        if (fs.existsSync(HISTORY_FILE)) {
            try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch (e) { history = []; }
        }

        // Use the current 2026 model: gemini-3-flash-preview
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3-flash-preview", 
            tools: [{ googleSearch: {} }] // This enables real-time web verification
        });

        let validData = null;
        let attempts = 0;

        while (!validData && attempts < 5) {
            attempts++;
            console.log(`Attempt ${attempts}: Generating fact using Gemini 3 Search Grounding...`);

            const prompt = `Find one interesting fun fact for adults. 
            TONE: Conversational, like a person talking to a friend. No "AI-voice."
            RULES: Concise (max 3 sentences), English only. NO gross/dark/medical topics.
            SOURCE: You MUST provide a real, working URL to a reputable source. 
            UNIQUE: Avoid: ${history.slice(-15).join(', ')}.
            OUTPUT: Return ONLY JSON: {"fact": "text", "source": "url"}`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            
            // Cleanup the response text just in case Gemini wraps it in markdown
            let text = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
            const data = JSON.parse(text);

            console.log(`Verifying: ${data.source}`);
            if (await checkUrl(data.source)) {
                validData = data;
            } else {
                console.log("Link failed verification. Retrying...");
            }
        }

        if (!validData) {
            console.error("Could not find a valid fact/link after 5 tries.");
            process.exit(1);
        }

        // Save progress
        history.push(validData.fact);
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        fs.writeFileSync(CURRENT_FILE, validData.fact); 

        // Post to Discord
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

        console.log("Success! Grounded fact posted.");
    } catch (error) {
        console.error("Fatal Error:", error);
        process.exit(1);
    }
}
main();
