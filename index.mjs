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
        // 1. Load History
        let history = [];
        if (fs.existsSync(HISTORY_FILE)) {
            history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // 2. Request unique fact
        const prompt = `Generate one interesting, sophisticated fun fact for an adult audience. 
        CRITICAL FILTERS: No gross stuff, no death, no cutesy trivia. Focus on science, history, or engineering.
        UNIQUE CHECK: Do not provide any of these previous facts: ${history.slice(-20).join(', ')}.
        Return ONLY a JSON object: {"fact": "the text", "source": "URL"}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().replace(/```json|```/g, "").trim();
        const data = JSON.parse(text);

        // 3. Save to History and Current Text File
        history.push(data.fact);
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        fs.writeFileSync(CURRENT_FILE, data.fact); // Just the raw text for Mix It Up

        // 4. Send to Discord
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

        console.log("Fact processed and saved!");
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}
main();
