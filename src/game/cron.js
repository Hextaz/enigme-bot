const cron = require('node-cron');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const { Joueur } = require('../db/models');

// Variables globales pour les paris
let parisActifs = false;
let coureurs = [];
let parisJoueurs = {}; // { discord_id: { coureurId, montant } }

function initCronJobs(client) {
    // Reset quotidien à 11h00 : Tout le monde a le droit de jouer
    cron.schedule('0 11 * * *', async () => {
        const tousLesJoueurs = await Joueur.findAll();
        for (const j of tousLesJoueurs) {
            j.a_le_droit_de_jouer = true;
            j.guess_du_jour = 0;
            j.boutique_du_jour = [];
            await j.save();
        }
        console.log('Reset quotidien effectué : tous les joueurs peuvent jouer.');
    });

    // Samedi 10h00 : Lancement des paris
    // '0 10 * * 6' = À 10:00 le samedi
    cron.schedule('0 10 * * 6', async () => {
        const channel = client.channels.cache.get(config.boardChannelId);
        if (!channel) return;

        parisActifs = true;
        parisJoueurs = {};
        
        // Générer 4 coureurs avec des cotes
        const noms = ['Yoshi', 'Toad', 'Koopa', 'Maskass'];
        const cotes = [1.5, 2.5, 4.0, 10.0];
        
        // Mélanger les cotes
        cotes.sort(() => Math.random() - 0.5);

        coureurs = noms.map((nom, index) => ({
            id: index,
            nom: nom,
            cote: cotes[index]
        }));

        let msg = '🏇 **LES PARIS DU SAMEDI SONT OUVERTS !** 🏇\n\n';
        msg += 'Voici les coureurs du jour :\n';
        
        const row = new ActionRowBuilder();

        coureurs.forEach(c => {
            msg += `**${c.nom}** - Cote : x${c.cote}\n`;
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`pari_${c.id}`)
                    .setLabel(`Parier sur ${c.nom}`)
                    .setStyle(ButtonStyle.Primary)
            );
        });

        msg += '\n*Vous avez jusqu\'à 21h00 pour parier (Max 30 pièces). Un ticket gratuit de 3 pièces est offert à tous !*';

        await channel.send({ content: msg, components: [row] });
    }, {
        timezone: "Europe/Paris"
    });

    // Samedi 21h00 : Résultat des paris
    // '0 21 * * 6' = À 21:00 le samedi
    cron.schedule('0 21 * * 6', async () => {
        if (!parisActifs) return;
        parisActifs = false;

        const channel = client.channels.cache.get(config.boardChannelId);
        if (!channel) return;

        await channel.send('🏁 **LA COURSE COMMENCE !** 🏁');
        
        // Animation textuelle
        setTimeout(async () => {
            await channel.send('Les coureurs sont dans le dernier virage...');
        }, 3000);

        setTimeout(async () => {
            await channel.send('C\'est très serré !');
        }, 6000);

        setTimeout(async () => {
            // Déterminer le gagnant (pondéré par les cotes pour plus de réalisme, ou totalement aléatoire)
            // Pour simplifier, on fait un tirage aléatoire simple
            const gagnant = coureurs[Math.floor(Math.random() * coureurs.length)];
            
            let resultMsg = `🏆 **${gagnant.nom.toUpperCase()} REMPORTE LA COURSE !** 🏆\n\n`;

            let gagnantsCount = 0;
            for (const [discordId, pari] of Object.entries(parisJoueurs)) {
                if (pari.coureurId === gagnant.id) {
                    const gain = Math.floor(pari.montant * gagnant.cote);
                    const joueur = await Joueur.findByPk(discordId);
                    if (joueur) {
                        joueur.pieces += gain;
                        await joueur.save();
                        resultMsg += `<@${discordId}> gagne **${gain} pièces** ! *(Total: ${joueur.pieces} 🪙)*\n`;
                        gagnantsCount++;
                    }
                }
            }

            if (gagnantsCount === 0) {
                resultMsg += '*Personne n\'a parié sur le bon coureur... Le bot s\'enrichit ! 🤖💰*';
            }

            await channel.send(resultMsg);
        }, 9000);

    }, {
        timezone: "Europe/Paris"
    });

    // Dimanche : Le Marché Noir (Géré dans la logique de la boutique)
    // On peut juste envoyer une annonce le dimanche matin
    cron.schedule('0 10 * * 0', async () => {
        const channel = client.channels.cache.get(config.boardChannelId);
        if (channel) {
            await channel.send('🛍️ **LE MARCHÉ NOIR EST OUVERT !** 🛍️\nLes boutiques proposent aujourd\'hui des objets dévastateurs exclusifs !');
        }
    }, {
        timezone: "Europe/Paris"
    });

    // Reset quotidien à 11h00
    cron.schedule('0 11 * * 1-5', async () => {
        const channel = client.channels.cache.get(config.boardChannelId);
        if (channel) {
            const tousLesJoueurs = await Joueur.findAll();
            const oublis = tousLesJoueurs.filter(j => j.a_le_droit_de_jouer);
            
            let msg = '⏰ **Fin du tour !** Le plateau est verrouillé jusqu\'à la prochaine énigme.\n';
            
            if (oublis.length > 0) {
                msg += `\n⚠️ **Ils ont oublié de jouer aujourd'hui :**\n`;
                oublis.forEach(j => {
                    msg += `- <@${j.discord_id}>\n`;
                });
                msg += `*Tant pis pour eux !*`;
            }
            
            await channel.send(msg);
        }
        
        // On pourrait réinitialiser les variables ici si besoin, 
        // mais elles sont déjà gérées lors de la publication de l'énigme.
    }, {
        timezone: "Europe/Paris"
    });
}

async function handlePari(interaction) {
    if (!parisActifs) {
        return interaction.reply({ content: 'Les paris sont fermés !', ephemeral: true });
    }

    const coureurId = parseInt(interaction.customId.split('_')[1]);
    const coureur = coureurs.find(c => c.id === coureurId);

    if (!coureur) return interaction.reply({ content: 'Coureur introuvable.', ephemeral: true });

    if (parisJoueurs[interaction.user.id]) {
        return interaction.reply({ content: 'Tu as déjà parié !', ephemeral: true });
    }

    // Demander le montant (on simplifie en utilisant un bouton ou un modal, mais Discord.js v14 permet les Modals)
    // Pour faire simple ici, on va juste enregistrer un pari fixe ou utiliser un Modal
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

    const modal = new ModalBuilder()
        .setCustomId(`modal_pari_${coureurId}`)
        .setTitle(`Pari sur ${coureur.nom}`);

    const montantInput = new TextInputBuilder()
        .setCustomId('montant')
        .setLabel("Montant du pari (Max 30, 3 offerts)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue("3"); // Valeur par défaut (le ticket gratuit)

    const firstActionRow = new ActionRowBuilder().addComponents(montantInput);
    modal.addComponents(firstActionRow);

    await interaction.showModal(modal);
}

async function handleModalPari(interaction) {
    const coureurId = parseInt(interaction.customId.split('_')[2]);
    const montantStr = interaction.fields.getTextInputValue('montant');
    let montant = parseInt(montantStr);

    if (isNaN(montant) || montant < 0 || montant > 30) {
        return interaction.reply({ content: 'Montant invalide. Doit être entre 0 et 30.', ephemeral: true });
    }

    const joueur = await Joueur.findByPk(interaction.user.id);
    if (!joueur) {
        return interaction.reply({ content: 'Tu n\'es pas inscrit au jeu.', ephemeral: true });
    }

    // Le ticket gratuit de 3 pièces
    let coutReel = Math.max(0, montant - 3);

    if (joueur.pieces < coutReel) {
        return interaction.reply({ content: `Tu n'as pas assez de pièces. Il te faut ${coutReel} pièces (3 sont offertes).`, ephemeral: true });
    }

    joueur.pieces -= coutReel;
    await joueur.save();

    parisJoueurs[interaction.user.id] = {
        coureurId: coureurId,
        montant: montant
    };

    const coureur = coureurs.find(c => c.id === coureurId);
    await interaction.reply({ content: `Tu as parié **${montant} pièces** sur **${coureur.nom}** ! *(Il te reste ${joueur.pieces} 🪙)*`, ephemeral: true });
}

module.exports = {
    initCronJobs,
    handlePari,
    handleModalPari
};
