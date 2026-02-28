require('dotenv').config();

module.exports = {
    token: process.env.DISCORD_TOKEN,
    guildId: process.env.GUILD_ID,
    enigmaChannelId: process.env.ENIGMA_CHANNEL_ID,
    boardChannelId: process.env.BOARD_CHANNEL_ID,
    mjUserId: process.env.MJ_USER_ID,
    roleEnigmeId: process.env.ROLE_ENIGME_ID,
};
