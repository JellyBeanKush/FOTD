import fetch from 'node-fetch';

// Your provided Webhook URL
const WEBHOOK_URL = "https://discord.com/api/webhooks/1474172208187445339/ILPeGeXs2MXh6wCsqPzJw7z5Pc8K6gyAHWLEvH0r8Xvy-MoOMcqTQmI0tuW6r7whB3En";

async function main() {
    try {
        // Fetch a random fact from the API
        const response = await fetch('https://uselessfacts.jsph.pl/api/v2/facts/today');
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        
        const data = await response.json();

        // Prepare the payload for Discord
        const payload = {
            username: "Fact of the Day",
            avatar_url: "https://i.imgur.com/8nLFCvp.png", // A lightbulb icon
            content: `🧐 **SQUISHY FACT OF THE DAY**\n\n> ${data.text}`
        };

        // Send to Discord via Webhook
        const discordResponse = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (discordResponse.ok) {
            console.log("Fact posted successfully!");
        } else {
            console.log("Failed to post to Discord:", discordResponse.statusText);
        }
    } catch (error) {
        console.error("Error running Fact of the Day:", error);
        process.exit(1);
    }
}

main();
