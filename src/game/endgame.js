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

    const tousLesJoueurs = await Joueur.findAll();
    if (tousLesJoueurs.length > 0) {
        const bonusStars = [
            { id: 'chance', name: 'Étoile de la Chance 🍀', desc: 'pour avoir atterri sur le plus de cases Chance ou Bleues', getWinners: (js) => { const max = Math.max(...js.map(j => (j.stat_cases_chance || 0))); return max > 0 ? js.filter(j => (j.stat_cases_chance || 0) === max) : []; } },
            { id: 'malchance', name: 'Étoile de la Malchance 🌩️', desc: 'pour avoir atterri sur le plus de cases Malchance, Rouges ou Bowser', getWinners: (js) => { const max = Math.max(...js.map(j => (j.stat_cases_malchance || 0))); return max > 0 ? js.filter(j => (j.stat_cases_malchance || 0) === max) : []; } },
            { id: 'avancee_max', name: 'Étoile du Grand Voyageur 🏃', desc: 'pour avoir le plus avancé sur le plateau', getWinners: (js) => { const max = Math.max(...js.map(j => (j.stat_cases_avancees || 0))); return max > 0 ? js.filter(j => (j.stat_cases_avancees || 0) === max) : []; } },
            { id: 'avancee_min', name: 'Étoile du Paresseux 🐢', desc: 'pour avoir le moins avancé sur le plateau', getWinners: (js) => { const min = Math.min(...js.map(j => (j.stat_cases_avancees || 0))); return js.filter(j => (j.stat_cases_avancees || 0) === min); } },
            { id: 'enigme', name: 'Étoile du Génie 🧠', desc: 'pour avoir résolu le plus d\'énigmes', getWinners: (js) => { const max = Math.max(...js.map(j => (j.stat_enigmes_trouvees || 0))); return max > 0 ? js.filter(j => (j.stat_enigmes_trouvees || 0) === max) : []; } },
            { id: 'objet', name: 'Étoile de l\'Acheteur Compulsif 🎒', desc: 'pour avoir utilisé le plus d\'objets', getWinners: (js) => { const max = Math.max(...js.map(j => (j.stat_objets_utilises || 0))); return max > 0 ? js.filter(j => (j.stat_objets_utilises || 0) === max) : []; } }
        ];

        const shuffled = bonusStars.sort(() => 0.5 - Math.random());
        const pickedStars = shuffled.slice(0, 2);
        let recapMsg = '✨ **LE MOMENT DES ÉTOILES BONUS !** ✨\n\n2 étoiles aléatoires vont être distribuées parmi plusieurs catégories :\n\n';

        for (const star of pickedStars) {
            recapMsg += `**${star.name}** (*${star.desc}*)\n`;
            const winners = star.getWinners(tousLesJoueurs);
            
            if (winners.length > 0) {
                const winnerText = winners.map(w => `<@${w.discord_id}>`).join(' et ');
                recapMsg += `🏆 Décernée à : ${winnerText} ! (+1 ⭐)\n\n`;
                for (const w of winners) {
                    w.etoiles += 1;
                    await w.save();
                }
            } else {
                recapMsg += `😔 Personne ne remporte cette étoile pour cette partie !\n\n`;
            }
        }

        await channel.send(recapMsg);
    }
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
        const winnerRoleId = '1490005606273388555';
        let winnerRole = await guild.roles.fetch(winnerRoleId).catch(() => null);

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
