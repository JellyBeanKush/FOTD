import { Client, GatewayIntentBits } from 'discord.js';
import fetch from 'node-fetch';

const CHANNEL_ID = "1069415435717591161"; 

async function main() {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await client.login(process.env.DISCORD_TOKEN);

    // Fetch a random fact
    const response = await fetch('https://uselessfacts.jsph.pl/api/v2/facts/today');
    const data = await response.json();

    const channel = await client.channels.fetch(CHANNEL_ID);
    await channel.send(`🧐 **SQUISHY FACT OF THE DAY**\n\n> ${data.text}`);

    process.exit(0);
}
main();
