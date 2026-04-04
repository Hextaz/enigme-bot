const { Joueur, Plateau } = require('../db/models');
const config = require('../config');

// Annoncer le podium, attribuer le rôle Vainqueur et clore la partie
async function endSeason(client) {
    const channel = client.channels.cache.get(config.boardChannelId);
    if (!channel) return;

    let plateau = await Plateau.findByPk(1);
    if (plateau) {
        plateau.enigme_resolue = true;
        plateau.enigme_status = 'finished'; // On verrouille le plateau
        await plateau.save();
    }

    // Récupérer le podium
    const joueurs = await Joueur.findAll({
        order: [
            ['etoiles', 'DESC'],
            ['pieces', 'DESC']
        ],
        limit: 3
    });

    if (joueurs.length === 0) return;

    let podiumMsg = '🏆 **FIN DU PLATEAU 30 TOURS ! Voici le podium :** 🏆\n\n';
    const medailles = ['🥇', '🥈', '🥉'];

    joueurs.forEach((joueur, index) => {
        podiumMsg += `${medailles[index]} <@${joueur.discord_id}> avec ${joueur.etoiles} ⭐ et ${joueur.pieces} 🪙\n`;
    });

    const guild = await client.guilds.fetch(config.guildId).catch(() => null);
    if (guild) {
        let winnerRole = guild.roles.cache.find(r => r.name === "Vainqueur d'une partie");
        if (!winnerRole) {
            try {
                winnerRole = await guild.roles.create({
                    name: "Vainqueur d'une partie",
                    color: '#FFD700',
                    hoist: true,
                    reason: 'Rôle automatique pour le vainqueur de la saison'
                });
            } catch (e) {
                console.error("Impossible de créer le rôle vainqueur :", e);
            }
        }

        if (winnerRole) {
            // Nettoyer les anciens membres
            const membersWithRole = winnerRole.members;
            if (membersWithRole) {
                for (const [memberId, member] of membersWithRole) {
                    await member.roles.remove(winnerRole).catch(() => {});
                }
            }

            // Donner le rôle au gagnant (index 0)
            if (joueurs[0]) {
                const winnerMember = await guild.members.fetch(joueurs[0].discord_id).catch(() => null);
                if (winnerMember) {
                    await winnerMember.roles.add(winnerRole).catch(() => {});
                    podiumMsg += `\n\n👑 Le titre exclusif de **Vainqueur d'une partie** a été attribué à <@${joueurs[0].discord_id}> !\nFélicitations pour cette victoire ! 🎉`;
                }
            }
        }
    }

    await channel.send(podiumMsg);
    
    // Bloquer tout le monde
    const tous = await Joueur.findAll();
    for (const j of tous) {
        j.a_le_droit_de_jouer = false;
        await j.save();
    }
}

module.exports = { endSeason };
