const fs = require('fs');
let code = fs.readFileSync('src/index.js', 'utf8');

const oldStringSelect = `} else if (interaction.customId === 'de_pipe_choix') {
                const { handleDePipeChoix } = require('./game/events');
                await handleDePipeChoix(interaction);
            }`;
            
const newStringSelect = `} else if (interaction.customId === 'de_pipe_choix') {
                const { handleDePipeChoix } = require('./game/events');
                await handleDePipeChoix(interaction);
            } else if (interaction.customId.startsWith('replace_buy_')) {
                const { handleReplaceBuy } = require('./game/events');
                await handleReplaceBuy(interaction);
            } else if (interaction.customId.startsWith('replace_chance_')) {
                const { handleReplaceChance } = require('./game/events');
                await handleReplaceChance(interaction);
            }`;
            
code = code.replace(oldStringSelect, newStringSelect);

const oldButtonDiscard = `} else if (interaction.customId.startsWith('buy_')) {
                // e.g. buy_cancel or buy_sifflet or buy_piege_pieces`;
const newButtonDiscard = `} else if (interaction.customId === 'discard_new_item') {
                await interaction.update({ content: 'Tu as choisi de garder ton inventaire tel quel. Le nouvel objet est jeté.', components: [] }).catch(()=>{});
            } else if (interaction.customId.startsWith('buy_')) {
                // e.g. buy_cancel or buy_sifflet or buy_piege_pieces`;

code = code.replace(oldButtonDiscard, newButtonDiscard);
fs.writeFileSync('src/index.js', code);
console.log('index patched');
