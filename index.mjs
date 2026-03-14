import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from 'node-fetch';
import fs from 'fs';

const CONFIG = {
    GEMINI_KEY: process.env.GEMINI_API_KEY,
    DISCORD_URL: process.env.DISCORD_WEBHOOK_URL,
    SAVE_FILE: 'current_fact.txt',
    HISTORY_FILE: 'used_facts.json',
    MODELS: [
        "gemini-3.1-flash-lite-preview", 
        "gemini-3-flash-preview",       
        "gemini-2.0-flash",             
        "gemini-1.5-flash-latest",      
        "gemini-1.5-pro-latest"         
    ]
};

const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' };
const displayDate = new Date().toLocaleDateString('en-US', options);
const todayISO = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' });

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetches a TRULY RANDOM high-quality topic.
 * Rejects "stubs" to ensure Gemini has enough context to find a "deep cut" fact.
 */
async function getRandomQualityTopic() {
    for (let i = 0; i < 5; i++) {
        try {
            const response = await fetch("https://en.wikipedia.org/api/rest_v1/page/random/summary");
            const data = await response.json();
            
            // Filter: Ensure it has an extract and is longer than a dictionary stub
            if (data.extract && data.extract.length > 250) {
                return {
                    title: data.title,
                    url: data.content_urls.desktop.page,
                    thumbnail: data.thumbnail ? data.thumbnail.source : null,
                    extract: data.extract
                };
            }
        } catch (e) {
            console.error("Wiki Random Fetch Error:", e);
        }
    }
    // Final fallback if 5 random picks fail
    return { 
        title: "Pando (tree)", 
        url: "https://en.wikipedia.org/wiki/Pando_(tree)", 
        extract: "Pando is a clonal colony of an individual male quaking aspen determined to be a single living organism by identical genetic markers." 
    };
}

async function postToDiscord(factData) {
    const discordPayload = {
        embeds: [{
            title: `🧠 ${factData.headline}`,
            // DESCRIPTION UPDATED: Combines context and the fact description
            description: `**The Context:** ${factData.context}\n\n**Did you know?** ${factData.description}\n\n**[Learn about ${factData.eventTitle}](${factData.sourceUrl})**`,
            color: 0x3498db,
            image: { url: factData.imageUrl },
            footer: { text: `Random Fact • ${displayDate}` }
        }]
    };
    
    const response = await fetch(CONFIG.DISCORD_URL, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(discordPayload) 
    });

    if (!response.ok) console.error("Discord Post Failed:", await response.text());
}

async function main() {
    // 1. Prevent duplicate runs today
    if (fs.existsSync(CONFIG.SAVE_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(CONFIG.SAVE_FILE, 'utf8'));
            if (saved.generatedDate === todayISO) {
                console.log("Already posted today. Skipping.");
                return;
            }
        } catch (e) {}
    }

    // 2. Load history and get topic
    let historyData = [];
    if (fs.existsSync(CONFIG.HISTORY_FILE)) {
        try { historyData = JSON.parse(fs.readFileSync(CONFIG.HISTORY_FILE, 'utf8')); } catch (e) {}
    }
    
    const usedTitles = historyData.slice(0, 50).map(h => h.eventTitle.toLowerCase());
    const wikiTopic = await getRandomQualityTopic();

    // 3. Prompt Engineering
    const prompt = `
        Task: Provide a mind-blowing, conversational, and obscure fact about the Wikipedia topic: "${wikiTopic.title}".
        Topic Context: ${wikiTopic.extract}
        
        Requirements:
        1. "headline": A punchy, catchy 3-5 word headline.
        2. "context": A 1-2 sentence foundation. Explain what this is/who they are as if the reader has NEVER heard of it. Focus on the "who, what, and where."
        3. "description": A "deep cut" fact (under 45 words) that follows the context. Surprising tone.
        4. Do NOT mention dates or "today in history" - this is for random knowledge.
        5. Avoid these previous topics: ${usedTitles.join(", ")}

        JSON ONLY:
        {
          "headline": "Headline Here",
          "context": "The foundation info here",
          "eventTitle": "${wikiTopic.title}",
          "description": "The surprising fact here",
          "sourceUrl": "${wikiTopic.url}",
          "imageUrl": "${wikiTopic.thumbnail || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3"}"
        }`;
    
    const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_KEY);

    for (const modelName of CONFIG.MODELS) {
        try {
            console.log(`Attempting with ${modelName} using topic: ${wikiTopic.title}...`);
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
            });

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            const factData = JSON.parse(responseText);

            if (usedTitles.includes(factData.eventTitle.toLowerCase())) {
                throw new Error(`Duplicate topic: ${factData.eventTitle}`);
            }
            
            factData.generatedDate = todayISO;
            fs.writeFileSync(CONFIG.SAVE_FILE, JSON.stringify(factData, null, 2));
            
            historyData.unshift(factData);
            fs.writeFileSync(CONFIG.HISTORY_FILE, JSON.stringify(historyData.slice(0, 100), null, 2));
            
            await postToDiscord(factData);
            console.log(`Success! Posted to Discord using ${modelName}.`);
            return; 
        } catch (err) {
            console.warn(`⚠️ ${modelName} failed: ${err.message}`);
            if (err.message.includes("429")) {
                console.log("Waiting 5 seconds for quota reset...");
                await sleep(5000);
            }
        }
    }
}

main().catch(err => {
    console.error("\n💥 Bot crashed!");
    console.error(err);
    process.exit(1);
});
