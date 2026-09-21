const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envLocalPath = path.join(__dirname, '../.env.local');
const envPath = path.join(__dirname, '../.env');

if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath });
}
dotenv.config({ path: envPath });

module.exports = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID,
    guildId: process.env.GUILD_ID || process.env.DISCORD_GUILD_ID,
    enigmaChannelId: process.env.ENIGMA_CHANNEL_ID,
    boardChannelId: process.env.BOARD_CHANNEL_ID,
    mjUserId: process.env.MJ_USER_ID,
    roleEnigmeId: process.env.ROLE_ENIGME_ID,
    kumaPushUrl: process.env.KUMA_PUSH_URL || null,
    kumaPushIntervalSec: parseInt(process.env.KUMA_PUSH_INTERVAL_SEC || '60', 10),
    kumaMaxFailures: parseInt(process.env.KUMA_MAX_FAILURES || '3', 10),
};
