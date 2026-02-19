import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const GEMINI_KEY = "AIzaSyBZn2tHx2jtpKHZgCRs6H8PxwQj9FAPn6w"; 
const WEBHOOK_URL = "https://discord.com/api/webhooks/1474172208187445339/ILPeGeXs2MXh6wCsqPzJw7z5Pc8K6gyAHWLEvH0r8Xvy-MoOMcqTQmI0tuW6r7whB3En";
const HISTORY_FILE = 'used_facts.json';
const CURRENT_FILE = 'current_fact.txt';

const genAI = new GoogleGenerativeAI(GEMINI_KEY);

async function main() {
    try {
        let history = [];
        if (fs.existsSync(HISTORY_FILE)) {
            try {
                history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
            } catch (e) { history = []; }
        }

        // Using the 3.0 Flash model (Standard for Free Tier in 2026)
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

        const prompt = `Generate one highly interesting, sophisticated fun fact for an adult audience. 
        CRITICAL CONTENT FILTERS:
        1. NO "gross," bodily function, or medical horror facts.
        2. NO dark, depressing, or death-related topics.
        3. NO cutesy or "kid-oriented" trivia.
        4. Focus on high-level science, architecture, history, or engineering.
        5. UNIQUE CHECK: Do not repeat these: ${history.slice(-15).join(', ')}.

        Return ONLY a JSON object: {"fact": "the text", "source": "verified_url"}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
        
        const data = JSON.parse(text);

        // Save History
        history.push(data.fact);
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        fs.writeFileSync(CURRENT_FILE, data.fact); 

        // Discord Payload
        const payload = {
            username: "Fact of the Day",
            avatar_url: "https://i.imgur.com/8nLFCvp.png",
            embeds: [{
                title: "✨ Today's Fact",
                description: `${data.fact}\n\n🔗 **[Click to Verify Source](${data.source})**`,
                color: 0x00ff99
            }]
        };

        await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log("Success! Fact posted via Gemini 3 Flash.");
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}
main();
