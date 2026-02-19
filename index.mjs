import fetch from 'node-fetch';

const WEBHOOK_URL = "https://discord.com/api/webhooks/1474172208187445339/ILPeGeXs2MXh6wCsqPzJw7z5Pc8K6gyAHWLEvH0r8Xvy-MoOMcqTQmI0tuW6r7whB3En";

async function main() {
    try {
        // Fetching from a more reliable "Fun Fact" source
        const response = await fetch('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en');
        const data = await response.json();

        // Discord Embed Payload
        const payload = {
            username: "Fact of the Day",
            avatar_url: "https://i.imgur.com/8nLFCvp.png", 
            embeds: [{
                title: "✨ Today's Fact",
                description: data.text,
                color: 0xffcc00, // Gold color
                fields: [
                    {
                        name: "Verification",
                        value: `[View Source/Verify](${data.source_url})`,
                        inline: true
                    }
                ],
                footer: {
                    text: "Fact of the Day • Automated Daily Updates"
                },
                timestamp: new Date().toISOString()
            }]
        };

        const discordResponse = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (discordResponse.ok) {
            console.log("Fact posted successfully!");
        } else {
            console.log("Discord error:", discordResponse.statusText);
        }
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

main();
