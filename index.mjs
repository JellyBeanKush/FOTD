import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const GEMINI_KEY = "AIzaSyBZn2tHx2jtpKHZgCRs6H8PxwQj9FAPn6w"; 
const WEBHOOK_URL = "https://discord.com/api/webhooks/1474172208187445339/ILPeGeXs2MXh6wCsqPzJw7z5Pc8K6gyAHWLEvH0r8Xvy-MoOMcqTQmI0tuW6r7whB3En";
const HISTORY_FILE = 'used_facts.json';
const CURRENT_FILE = 'current_fact.txt';

const genAI = new GoogleGenerativeAI(GEMINI_KEY);

// UPDATED: The Smarter Bouncer
async function checkUrl(url) {
    try {
        const response = await fetch(url, {
            headers: { 
                // Disguise the bot as a normal Windows/Chrome user
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            signal: AbortSignal.timeout(8000) // Give it up to 8 seconds to load
        });
        
        // If it's a standard 200 OK, it passes.
        // If it's a 403 (Forbidden) or 401 (Unauthorized), the page EXISTS, it's just blocking our bot. We let it pass!
        if (response.ok || response.status === 403 || response.status === 401) {
            return true; 
        }
        
        // If it's 404 (Not Found) or anything else, it goes in the trash.
        console.log(`Failed with status: ${response.status}`);
        return false; 
    } catch (error) {
        return false; // Timeouts or network crashes go in the trash
    }
}

async function main() {
    try {
        let history = [];
        if (fs.existsSync(HISTORY_FILE)) {
            try {
                history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
            } catch (e) { history = []; }
        }

        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

        let validData = null;
        let attempts = 0;
        const maxAttempts = 5;

        while (!validData && attempts < maxAttempts) {
            attempts++;
            console.log(`Attempt ${attempts}: Asking AI for a fact...`);

            const prompt = `Generate one highly interesting, sophisticated fun fact for an adult audience. 
            STYLE RULES:
            1. Use natural, conversational English (like you're telling a friend at a bar).
            2. Keep it concise. No "walls of text."
            3. NO gross/medical, dark/depressing, or cutesy/kid stuff.
            4. Focus on cool science, history, or engineering.
            5. LANGUAGE: English only.

            LINK RULES:
            - You MUST provide a URL to a reputable source. 
            - Link to top-level articles or main encyclopedia pages to avoid broken links.

            UNIQUE CHECK: Do not repeat these: ${history.slice(-15).join(', ')}.

            Return ONLY a JSON object: {"fact": "the text", "source": "verified_url"}`;

            try {
                const result = await model.generateContent(prompt);
                const response = await result.response;
                let text = response.text().replace(/```json/g, "").replace(/```/g, "").trim();
                const data = JSON.parse(text);

                console.log(`Testing URL: ${data.source}`);
                const isAlive = await checkUrl(data.source);

                if (isAlive) {
                    console.log("URL is valid! Proceeding...");
                    validData = data; 
                } else {
                    console.log("URL is a 404 or dead. Trashing it and trying again.");
                }
            } catch (err) {
                console.log("AI returned bad formatting. Retrying...");
            }
        }

        if (!validData) {
            console.error("Failed to find a working link after 5 tries.");
            process.exit(1); 
        }

        history.push(validData.fact);
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
        fs.writeFileSync(CURRENT_FILE, validData.fact); 

        const payload = {
            username: "Fact of the Day",
            avatar_url: "https://i.imgur.com/8nLFCvp.png",
            embeds: [{
                title: "✨ Today's Fact",
                description: `${validData.fact}\n\n🔗 **[Source](${validData.source})**`,
                color: 0x00ff99
            }]
        };

        await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log("Success! Fact posted with a verified link.");
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}
main();
