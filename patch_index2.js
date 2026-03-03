const fs = require('fs');
let code = fs.readFileSync('src/index.js', 'utf8');

// Using regex or simpler slice
const s1 = code.indexOf("} else if (interaction.customId === 'de_pipe_choix') {");
const e1 = code.indexOf("}", code.indexOf("await handleDePipeChoix(interaction);"));

if (s1 !== -1 && e1 !== -1) {
    const replacement = `} else if (interaction.customId === 'de_pipe_choix') {
                const { handleDePipeChoix } = require('./game/events');
                await handleDePipeChoix(interaction);
            } else if (interaction.customId.startsWith('replace_buy_')) {
                const { handleReplaceBuy } = require('./game/events');
                await handleReplaceBuy(interaction);
            } else if (interaction.customId.startsWith('replace_chance_')) {
                const { handleReplaceChance } = require('./game/events');
                await handleReplaceChance(interaction);`;
    code = code.substring(0, s1) + replacement + code.substring(e1);
} else {
    console.log("Could not find string select block");
}

const s2 = code.indexOf("} else if (interaction.customId.startsWith('buy_')) {");
if (s2 !== -1) {
    const replacement2 = `} else if (interaction.customId === 'discard_new_item') {
                await interaction.update({ content: 'Tu as choisi de garder ton inventaire tel quel. Le nouvel objet est jeté.', components: [] }).catch(()=>{});
            } else if (interaction.customId.startsWith('buy_')) {`;
    code = code.substring(0, s2) + replacement2 + code.substring(s2 + 53); // 53 is length of matched string
} else {
    console.log("Could not find button block");
}

fs.writeFileSync('src/index.js', code);
console.log('patched again!');
