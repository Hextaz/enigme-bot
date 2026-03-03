const cron = require('node-cron');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const { Joueur, Plateau } = require('../db/models');

// Variables globales pour les paris
let parisActifs = false;
let coureurs = [];
let parisJoueurs = {}; // { discord_id: { coureurId, montant } }

function initCronJobs(client) {
    // Rappel 2h avant la fin du tour (9h00 du matin) pour ceux qui n'ont pas joué
    cron.schedule('0 9 * * *', async () => {
        const joueursARappeler = await Joueur.findAll({
            where: {
                a_le_droit_de_jouer: true,
                auto_remind_turn: true
            }
        });

        for (const j of joueursARappeler) {
            try {
                const user = await client.users.fetch(j.discord_id);
                if (user) {
                    await user.send("⏰ **Rappel automatique** : Le tour en cours sur le plateau se termine dans 2 heures ! N'oublie pas de faire `/jouer` !");
                }
            } catch (e) {
                console.error(`Impossible d'envoyer le rappel au joueur ${j.discord_id}`, e);
            }
        }
        console.log(`Rappel de fin de tour envoyé à ${joueursARappeler.length} joueur(s).`);
    });

    // Lundi à Vendredi 11h00 : Reset normal (bloque en attendant l'énigme)
    cron.schedule('0 11 * * 1-5', async () => {
        const tousLesJoueurs = await Joueur.findAll();
        for (const j of tousLesJoueurs) {
            j.a_le_droit_de_jouer = false; // On bloque le plateau jusqu'à la résolution de l'énigme
            j.guess_du_jour = 0;
            j.boutique_du_jour = [];
            j.last_deviner_time = null; // Reset du cooldown
            await j.save();
        }
        
        const plateau = await Plateau.findByPk(1);
        if (plateau) {
            plateau.enigme_status = 'active';
            plateau.enigme_reponse = null;
            plateau.premier_gagnant = null;
            plateau.autres_gagnants = [];
            await plateau.save();
        }
        
        console.log('Reset quotidien effectué : énigme réinitialisée, plateau bloqué.');
    });

    // Dimanche 11h00 : Ouverture automatique pour le Marché Noir (Pas d'énigme)
    cron.schedule('0 11 * * 0', async () => {
        const tousLesJoueurs = await Joueur.findAll();
        for (const j of tousLesJoueurs) {
            j.a_le_droit_de_jouer = true; // Plateau ouvert d'office !
            j.guess_du_jour = 0;
            j.boutique_du_jour = []; // Reset pour forcer la génération du marché noir
            j.last_deviner_time = null;
            await j.save();
        }

        const plateau = await Plateau.findByPk(1);
        if (plateau) {
            plateau.tour += 1; // On passe au tour suivant automatiquement
            plateau.enigme_resolue = true; // Pas d'énigme à résoudre aujourd'hui
            await plateau.save();
        }

        const channel = client.channels.cache.get(config.boardChannelId);
        if (channel) {
            let mentionRole = config.roleEnigmeId ? `<@&${config.roleEnigmeId}> ` : '';
            await channel.send(`${mentionRole}🛍️ **LE MARCHÉ NOIR EST OUVERT !** 🛍️\nLe plateau est déverrouillé, aucune énigme aujourd'hui. Les boutiques proposent des objets dévastateurs exclusifs ! Utilisez \`/jouer\` pour en profiter !`);
        }
    }, {
        timezone: "Europe/Paris"
    });

    // Samedi 10h00 : Lancement des paris (Le plateau est fermé)
    // '0 10 * * 6' = À 10:00 le samedi
    cron.schedule('0 10 * * 6', async () => {
        // Sécurité : On s'assure que tout le monde est bloqué pour le plateau
        const tousLesJoueurs = await Joueur.findAll();
        for (const j of tousLesJoueurs) {
            j.a_le_droit_de_jouer = false;
            await j.save();
        }
        const channel = client.channels.cache.get(config.boardChannelId);
        if (!channel) return;

        parisActifs = true;
        parisJoueurs = {};
        
        // Générer 5 Yoshis
        const noms = ['Yoshi Vert', 'Yoshi Rouge', 'Yoshi Bleu', 'Yoshi Jaune', 'Yoshi Noir'];
        
        coureurs = noms.map((nom, index) => ({
            id: index,
            nom: nom
        }));

        let msg = '🏇 **LES PARIS DU SAMEDI SONT OUVERTS !** 🏇\n\n';
        if (config.roleEnigmeId) {
            msg = `<@&${config.roleEnigmeId}> ` + msg;
        }
        msg += 'Misez sur votre Yoshi favori ! Le système fonctionne comme les prédictions Twitch : le pot total sera partagé entre les gagnants proportionnellement à leur mise.\n\n';
        
        const row = new ActionRowBuilder();

        coureurs.forEach(c => {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`pari_${c.id}`)
                    .setLabel(`Parier sur ${c.nom}`)
                    .setStyle(ButtonStyle.Primary)
            );
        });

        msg += '*Vous avez jusqu\'à 21h00 pour parier (Max 30 pièces). Un ticket gratuit de 3 pièces est offert à tous !*';

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

        await channel.send('🏁 **LA COURSE DE YOSHIS COMMENCE !** 🏁');
        
        // Animation textuelle
        setTimeout(async () => {
            await channel.send('Les Yoshis sont dans le dernier virage...');
        }, 3000);

        setTimeout(async () => {
            await channel.send('C\'est très serré !');
        }, 6000);

        setTimeout(async () => {
            // Déterminer le gagnant aléatoirement
            const gagnant = coureurs[Math.floor(Math.random() * coureurs.length)];
            
            let resultMsg = `🏆 **${gagnant.nom.toUpperCase()} REMPORTE LA COURSE !** 🏆\n\n`;

            // Calculer le pot total et le total misé sur le gagnant
            let potTotal = 0;
            let totalMiseGagnant = 0;
            
            for (const pari of Object.values(parisJoueurs)) {
                potTotal += pari.montant;
                if (pari.coureurId === gagnant.id) {
                    totalMiseGagnant += pari.montant;
                }
            }

            let gagnantsCount = 0;
            
            if (totalMiseGagnant > 0) {
                for (const [discordId, pari] of Object.entries(parisJoueurs)) {
                    if (pari.coureurId === gagnant.id) {
                        // Calcul du gain proportionnel : (Mise du joueur / Total misé sur le gagnant) * Pot Total
                        const part = pari.montant / totalMiseGagnant;
                        const gain = Math.floor(part * potTotal);
                        
                        const joueur = await Joueur.findByPk(discordId);
                        if (joueur) {
                            joueur.pieces += gain;
                            await joueur.save();
                            resultMsg += `<@${discordId}> gagne **${gain} pièces** (Mise: ${pari.montant}) ! *(Total: ${joueur.pieces} 🪙)*\n`;
                            gagnantsCount++;
                        }
                    }
                }
            }

            if (gagnantsCount === 0) {
                resultMsg += `*Personne n'a parié sur ${gagnant.nom}... Le pot de ${potTotal} pièces est perdu ! 🤖💰*`;
            } else {
                resultMsg += `\n*Pot total de ${potTotal} pièces partagé entre les gagnants !*`;
            }

            await channel.send(resultMsg);
        }, 9000);

    }, {
        timezone: "Europe/Paris"
    });

    // On a déjà géré l'annonce du Marché Noir à 11h00, donc on retire le cron de 10h00 le dimanche
    // (Lignes supprimées)

    // Annonce de fin de tour à 11h00 (du lundi au samedi, pour annoncer la fin du jour précédent)
    // Le dimanche à 11h00 on n'annonce rien car il n'y a pas eu de jeu le samedi
    cron.schedule('0 11 * * 1-6', async () => {
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

    if (isNaN(montant) || montant < 3 || montant > 30) {
        return interaction.reply({ content: 'Montant invalide. Doit être entre 3 et 30 (3 pièces sont offertes).', ephemeral: true });
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
