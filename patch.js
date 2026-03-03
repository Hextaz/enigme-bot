const fs = require('fs');
let code = fs.readFileSync('src/game/events.js', 'utf8');

// Part 1: Add pendingItemToReplace to processMovement
code = code.replace(
    /let messageAction;\s+if \(isContinuation\) {/g,
    `let messageAction;
    let pendingItemToReplace = null;
    if (isContinuation) {`
);

// Part 2: Change chance objet behavior
const chanceObjetOld = `if (joueur.inventaire.length < 3) {
                    joueur.inventaire = [...joueur.inventaire, randomItem.name];
                    messageAction += \`\\n🍀 **Chance !** **\${interaction.user.username}** obtient : \${randomItem.name} !\`;
                } else {
                    messageAction += \`\\n🍀 **Chance !** **\${interaction.user.username}** devait obtenir un objet mais son inventaire est plein !\`;
                }`;
const chanceObjetNew = `if (joueur.inventaire.length < 3) {
                    joueur.inventaire = [...joueur.inventaire, randomItem.name];
                    messageAction += \`\\n🍀 **Chance !** **\${interaction.user.username}** obtient : \${randomItem.name} !\`;
                } else {
                    messageAction += \`\\n🍀 **Chance !** **\${interaction.user.username}** a trouvé un **\${randomItem.name}**, mais son inventaire est plein ! (Regarde tes messages privés / menu secret pour faire de la place)\`;
                    pendingItemToReplace = randomItem;
                }`;
code = code.replace(chanceObjetOld, chanceObjetNew);

// Part 3: Append Select menu at the end of processMovement
const endMovementOld = `const replyContent = { content: \`Tu as atterri sur la case \${caseArrivee.id} ! Regarde le salon <#\${config.boardChannelId}> pour voir le résultat.\` };
        if (isContinuation) await interaction.followUp({ ...replyContent, ephemeral: true });
        else await interaction.editReply(replyContent);`;

const endMovementNew = `let replyContent = { content: \`Tu as atterri sur la case \${caseArrivee.id} ! Regarde le salon <#\${config.boardChannelId}> pour voir le résultat.\` };
        
        if (pendingItemToReplace) {
            const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const row = new ActionRowBuilder();
            const options = joueur.inventaire.map((itemName, index) => {
                return {
                    label: \`Jeter l'objet \${index + 1}: \${itemName}\`,
                    value: index.toString(),
                };
            });
            const selectOptions = new StringSelectMenuBuilder()
                .setCustomId(\`replace_chance_\${pendingItemToReplace.id}\`)
                .setPlaceholder('Choisir un objet à jeter')
                .addOptions(options);

            row.addComponents(selectOptions);

            const row2 = new ActionRowBuilder();
            row2.addComponents(
                new ButtonBuilder()
                    .setCustomId('discard_new_item')
                    .setLabel('Garder mon inventaire tel quel')
                    .setStyle(ButtonStyle.Danger)
            );

            replyContent = { 
                content: \`Tu as atterri sur la case \${caseArrivee.id} ! Regarde le salon <#\${config.boardChannelId}> pour voir le résultat.\\n\\nTon inventaire est plein ! Quel objet de ton inventaire veux-tu jeter pour garder **\${pendingItemToReplace.name}** ?\`, 
                components: [row, row2] 
            };
        }

        if (isContinuation) await interaction.followUp({ ...replyContent, ephemeral: true });
        else await interaction.editReply(replyContent);`;

code = code.replace(endMovementOld, endMovementNew);


// Part 4: Change handleBuyItem
const buyItemOld = `if (joueur.inventaire.length >= 3) {
            return interaction.reply({ content: 'Ton inventaire est plein (Max 3 objets).', ephemeral: true });
        }`;

const buyItemNew = `if (joueur.inventaire.length >= 3) {
            const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const row = new ActionRowBuilder();
            const options = joueur.inventaire.map((itemName, index) => {
                return {
                    label: \`Jeter l'objet \${index + 1}: \${itemName}\`,
                    value: index.toString(),
                };
            });
            const selectOptions = new StringSelectMenuBuilder()
                .setCustomId(\`replace_buy_\${item.id}\`)
                .setPlaceholder('Choisir un objet à jeter')
                .addOptions(options);

            row.addComponents(selectOptions);

            const row2 = new ActionRowBuilder();
            row2.addComponents(
                new ButtonBuilder()
                    .setCustomId('buy_cancel')
                    .setLabel('Annuler l\\'achat')
                    .setStyle(ButtonStyle.Danger)
            );

            return interaction.update({ 
                content: \`Ton inventaire est plein ! Quel objet veux-tu jeter pour acheter **\${item.name}** (\${item.price} pièces) ?\`, 
                components: [row, row2]
            }).catch(()=>{});
        }`;

code = code.replace(buyItemOld, buyItemNew);

// Part 5: Add New Handlers (handleReplaceBuy, handleReplaceChance)
const newHandlers = `
async function handleReplaceBuy(interaction) {
    const itemId = interaction.customId.replace('replace_buy_', '');
    const indexToDrop = parseInt(interaction.values[0]);
    const joueur = await Joueur.findByPk(interaction.user.id);
    
    if (!joueur) return interaction.reply({ content: 'Erreur', ephemeral: true });

    const { ITEMS } = require('./items');
    const itemKey = Object.keys(ITEMS).find(k => ITEMS[k].id === itemId);
    const item = ITEMS[itemKey];

    if (!item) return interaction.reply({ content: 'Objet inconnu.', ephemeral: true });

    if (joueur.pieces < item.price) {
        return interaction.update({ content: 'Tu n\\'as plus assez de pièces.', components: [] }).catch(()=>{});
    }

    joueur.pieces -= item.price;
    const droppedItem = joueur.inventaire[indexToDrop];
    
    const newInv = [...joueur.inventaire];
    newInv[indexToDrop] = item.name;
    joueur.inventaire = newInv;

    if (joueur.boutique_du_jour) {
        joueur.boutique_du_jour = joueur.boutique_du_jour.filter(id => id !== item.id);
    }

    await joueur.save();

    if (joueur.cases_restantes > 0) {
        await interaction.update({ content: \`🛒 Tu as jeté **\${droppedItem}** et acheté **\${item.name}** !\`, components: [] }).catch(()=>{});
        await handleContinuerDeplacement(interaction);
    } else {
        await interaction.update({ content: \`🛒 Tu as jeté **\${droppedItem}** et acheté **\${item.name}** ! Il te reste **\${joueur.pieces} pièces**.\`, components: [] }).catch(()=>{});
    }
}

async function handleReplaceChance(interaction) {
    const itemId = interaction.customId.replace('replace_chance_', '');
    const indexToDrop = parseInt(interaction.values[0]);
    const joueur = await Joueur.findByPk(interaction.user.id);
    
    if (!joueur) return interaction.reply({ content: 'Erreur', ephemeral: true });

    const { ITEMS } = require('./items');
    const itemKey = Object.keys(ITEMS).find(k => ITEMS[k].id === itemId);
    const item = ITEMS[itemKey];

    if (!item) return interaction.reply({ content: 'Objet inconnu.', ephemeral: true });

    const droppedItem = joueur.inventaire[indexToDrop];
    
    const newInv = [...joueur.inventaire];
    newInv[indexToDrop] = item.name;
    joueur.inventaire = newInv;

    await joueur.save();
    
    await interaction.update({ content: \`🗑️ Tu as jeté **\${droppedItem}** et gardé **\${item.name}** !\`, components: [] }).catch(()=>{});
}

`;

code = code.replace(
    /module\.exports = {/g,
    `${newHandlers}module.exports = {`
);

// export new handlers
code = code.replace(
    /handleBuyItem,\s+handleBuyCancel,/g,
    `handleBuyItem,\n    handleBuyCancel,\n    handleReplaceBuy,\n    handleReplaceChance,`
);

fs.writeFileSync('src/game/events.js', code);
console.log('Done!');
