const fs = require('fs');
let code = fs.readFileSync('src/game/events.js', 'utf8');

const start = code.indexOf("async function handleBuyItem");
const end = code.indexOf("async function handleBuyCancel", start);

const newBuyItem = `async function handleBuyItem(interaction) {
    const joueur = await Joueur.findByPk(interaction.user.id);
    const itemId = interaction.customId.replace('buy_', '');

    if (!joueur) return interaction.reply({ content: 'Erreur joueur.', ephemeral: true });

    const { ITEMS } = require('./items');
    const itemKey = Object.keys(ITEMS).find(k => ITEMS[k].id === itemId);
    const item = ITEMS[itemKey];

    if (!item) return interaction.reply({ content: 'Objet inconnu.', ephemeral: true });

    if (joueur.pieces < item.price) {
        return interaction.reply({ content: 'Tu n\\'as pas assez de pièces.', ephemeral: true });
    }

    if (item.isPack) {
        if (joueur.inventaire.length + item.contents.length > 3) {
            return interaction.reply({ content: \`Ton inventaire est trop plein pour ce pack (il te faut \${item.contents.length} places libres).\`, ephemeral: true });
        }
        joueur.pieces -= item.price;
        const newInv = [...joueur.inventaire];
        for (const contentKey of item.contents) {
            newInv.push(ITEMS[contentKey].name);
        }
        joueur.inventaire = newInv;
        if (joueur.boutique_du_jour) {
            joueur.boutique_du_jour = joueur.boutique_du_jour.filter(id => id !== item.id);
        }
        await joueur.save();
        if (joueur.cases_restantes > 0) {
            await interaction.update({ content: \`🛒 Tu as acheté **\${item.name}** !\`, components: [] }).catch(()=>{});
            await handleContinuerDeplacement(interaction);
        } else {
            return interaction.update({ content: \`🛒 Tu as acheté **\${item.name}** ! Il te reste **\${joueur.pieces} pièces**.\`, components: [] }).catch(()=>{});
        }
    } else {
        if (joueur.inventaire.length >= 3) {
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
        }
        joueur.pieces -= item.price;
        joueur.inventaire = [...joueur.inventaire, item.name];
        if (joueur.boutique_du_jour) {
            joueur.boutique_du_jour = joueur.boutique_du_jour.filter(id => id !== item.id);
        }
        await joueur.save();
        if (joueur.cases_restantes > 0) {
            await interaction.update({ content: \`🛒 Tu as acheté **\${item.name}** !\`, components: [] }).catch(()=>{});
            await handleContinuerDeplacement(interaction);
        } else {
            return interaction.update({ content: \`🛒 Tu as acheté **\${item.name}** ! Il te reste **\${joueur.pieces} pièces**.\`, components: [] }).catch(()=>{});
        }
    }
}

`;

code = code.substring(0, start) + newBuyItem + code.substring(end);
fs.writeFileSync('src/game/events.js', code);
console.log('Cleaned up handleBuyItem!');
