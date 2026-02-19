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

        // NEW: Check the actual text of the page for "Soft 404" indicators
        const bodyText = await response.text();
        const lowerText = bodyText.toLowerCase();
        const soft404Markers = ["page not found", "404 error", "couldn't find that page", "article not found"];
        
        if (soft404Markers.some(marker => lowerText.includes(marker)) && !lowerText.includes("here is a fact about 404 errors")) {
            console.log("Detected a 'Soft 404' error page. Rejecting.");
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

        // ENABLING SEARCH GROUNDING: This tells Gemini to use Google Search to find real links
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash", // Using the most stable grounding model
            tools: [{ googleSearch: {} }] 
        });

        let validData = null;
        let attempts = 0;

        while (!validData && attempts < 5) {
            attempts++;
            console.log(`Attempt ${attempts}: Generating grounded fact...`);

            const prompt = `Search for and generate one interesting, sophisticated fun fact for adults. 
            TONE: Conversational English, concise, no walls of text.
            TOPIC: Science, history, or engineering. No gross/dark/cutesy stuff.
            LINK: Provide a direct, working URL to a reputable source (like Britannica, NASA, or a University).
            UNIQUE: Avoid: ${history.slice(-15).join(', ')}.
            OUTPUT: JSON ONLY: {"fact": "text", "source": "url"}`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            let text = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
            const data = JSON.parse(text);

            console.log(`Testing URL: ${data.source}`);
            if (await checkUrl(data.source)) {
                validData = data;
            } else {
                console.log("Link failed content check. Retrying...");
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

        console.log("Success! Fact posted with grounded, verified link.");
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}
main();
