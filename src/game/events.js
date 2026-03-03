const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { Joueur, Plateau } = require('../db/models');
const { getCase, getCasesInRange } = require('./board');
const { generateBoardImage } = require('../utils/canvas');
const config = require('../config');

async function handleLancerDe(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const joueur = await Joueur.findByPk(interaction.user.id);
    if (!joueur || !joueur.a_le_droit_de_jouer) {
        return interaction.editReply({ content: 'Tu n\'as pas le droit de jouer.' });
    }

    // Lancer le dé
    let de = 0;
    if (joueur.type_de === 'double') {
        de = Math.floor(Math.random() * 11) + 2; // 2 à 12
        joueur.type_de = 'normal';
    } else if (joueur.type_de === 'triple') {
        de = Math.floor(Math.random() * 16) + 3; // 3 à 18
        joueur.type_de = 'normal';
    } else if (joueur.type_de === 'pipe') {
        de = joueur.de_pipe_valeur;
        joueur.type_de = 'normal';
    } else {
        de = Math.floor(Math.random() * 6) + 1; // 1 à 6
    }
    
    if (joueur.de_limite) {
        de = Math.min(de, 3);
        joueur.de_limite = false;
    }

    if (joueur.bonus_prochain_lancer > 0) {
        de += joueur.bonus_prochain_lancer;
        joueur.bonus_prochain_lancer = 0;
    }

    joueur.a_le_droit_de_jouer = false; // Il a joué pour aujourd'hui
    await joueur.save();

    await processMovement(interaction, joueur, de, false);
}

async function handleContinuerDeplacement(interaction) {
    if (!interaction.deferred && !interaction.replied) {
        // Enlève les boutons de l'ancien message (Shop, Etoile, /jouer) pour éviter les clics multiples
        await interaction.update({ components: [] }).catch(() => {});
    }
    const joueur = await Joueur.findByPk(interaction.user.id);
    if (!joueur || joueur.cases_restantes <= 0) {
        return interaction.editReply({ content: 'Tu n\'as pas de déplacement en cours.' });
    }

    if (!joueur.a_le_droit_de_jouer && joueur.cases_restantes === 0) {
        // Just a safety, but actually if a player was interrupted in the middle of a move yesterday,
        // should they be allowed to finish it today? Usually yes, but to be strict:
        // "jouer qu'une fois par tour" 
    }

    // Sécurité supplémentaire : On vérifie si l'énigme du jour n'est pas "active" 
    // Si c'est bloqué, alors on empêche tout déplacement (optionnel, mais efficace)
    const plateau = await Plateau.findByPk(1);
    if (plateau && plateau.enigme_status === 'active') {
        return interaction.editReply({ content: 'Le plateau est verrouillé ! Il faut d\'abord résoudre l\'énigme du jour.' });
    }

    const de = joueur.cases_restantes;
    await processMovement(interaction, joueur, de, true);
}

async function processMovement(interaction, joueur, de, isContinuation = false) {
    const anciennePosition = joueur.position;
    const plateau = await Plateau.findByPk(1);
    
    let nouvellePosition = anciennePosition + de;
    if (nouvellePosition > 42) nouvellePosition -= 42;

    const casesParcourues = getCasesInRange(anciennePosition, nouvellePosition);
    
    let interruption = null;
    let stepsTaken = 0;
    
    for (let i = 0; i < casesParcourues.length; i++) {
        const c = casesParcourues[i];
        if (c.id === anciennePosition) continue; // On ignore la case de départ
        
        stepsTaken++;
        
        if (c.id === plateau.position_etoile) {
            interruption = { type: 'etoile', case: c, steps: stepsTaken };
            break;
        } else if (c.type === 'Boutique') {
            interruption = { type: 'boutique', case: c, steps: stepsTaken };
            break;
        }
    }

    if (interruption) {
        joueur.position = interruption.case.id;
        joueur.cases_restantes = de - interruption.steps;
        await joueur.save();

        let messageAction;
        const cheminStr = joueur.cases_restantes > 0 ? "en chemin " : "";
        
        if (isContinuation) {
            messageAction = `🚶 **<@${interaction.user.id}>** continue et s'arrête ${cheminStr}sur la case **${interruption.case.id} (${interruption.type === 'etoile' ? 'Étoile' : 'Boutique'})** !`;
        } else {
            messageAction = `🎲 **<@${interaction.user.id}>** a fait un **${de}** et s'arrête ${cheminStr}sur la case **${interruption.case.id} (${interruption.type === 'etoile' ? 'Étoile' : 'Boutique'})** !`;
        }
        messageAction += `\n*(🤫 Un menu secret s'est ouvert en dessous de sa commande pour interagir avec la case !)*`;
        
        const channel = interaction.client.channels.cache.get(config.boardChannelId);
        if (channel) {
            let tousLesJoueurs = await Joueur.findAll();
            tousLesJoueurs = tousLesJoueurs.sort((a, b) => {
                if (a.discord_id === interaction.user.id) return 1;
                if (b.discord_id === interaction.user.id) return -1;
                return 0;
            });
            const buffer = await generateBoardImage(tousLesJoueurs, plateau, interaction.client);
            const attachment = new AttachmentBuilder(buffer, { name: 'board.png' });
            await channel.send({ content: messageAction, files: [attachment] });
        }

        if (interruption.type === 'etoile') {
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('acheter_etoile')
                        .setLabel('Acheter l\'Étoile (20 pièces)')
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(joueur.pieces < 20),
                    new ButtonBuilder()
                        .setCustomId('passer_etoile')
                        .setLabel('Passer')
                        .setStyle(ButtonStyle.Secondary)
                );
            
const contentText = joueur.cases_restantes > 0 
                ? `⭐ Tu passes devant l'Étoile ! Veux-tu l'acheter pour 20 pièces ? (Tu as ${joueur.pieces} pièces)`
                : `⭐ Tu atterris sur l'Étoile ! Veux-tu l'acheter pour 20 pièces ? (Tu as ${joueur.pieces} pièces)`;
            
            const replyContent = { content: contentText, components: [row] };
            if (isContinuation) await interaction.followUp({ ...replyContent, ephemeral: true });
            else await interaction.editReply(replyContent);
        } else if (interruption.type === 'boutique') {
            const { generateShop } = require('./shop');
            const shopItems = await generateShop(joueur.discord_id);

            const row = new ActionRowBuilder();
            let shopMsg = joueur.cases_restantes > 0 
                ? '🛒 **Tu passes devant une Boutique !** Voici ce que je te propose :\n\n'
                : '🛒 **Tu atterris sur une Boutique !** Voici ce que je te propose :\n\n';
            
            shopItems.forEach((item, index) => {
                shopMsg += `${index + 1}. **${item.name}** - ${item.price} pièces\n*${item.description}*\n\n`;
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`buy_${item.id}`)
                        .setLabel(`Acheter ${item.name} (${item.price}p)`)
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(joueur.pieces < item.price)
                );
            });

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('buy_cancel')
                    .setLabel('Quitter la boutique')
                    .setStyle(ButtonStyle.Danger)
            );

            const replyContent = { content: shopMsg, components: [row] };
            if (isContinuation) await interaction.followUp({ ...replyContent, ephemeral: true });
            else await interaction.editReply(replyContent);
        }
        return;
    }

    // Pas d'interruption, on arrive à la fin
    joueur.position = nouvellePosition;
    joueur.cases_restantes = 0;
    
    // Vérifier les pièges sur la case d'arrivée
    let piegeDeclenche = null;
    let piegesRestants = [...plateau.pieges_actifs];
    
    const piegeIndex = piegesRestants.findIndex(p => p.position === nouvellePosition);
    if (piegeIndex !== -1) {
        piegeDeclenche = piegesRestants[piegeIndex];
        piegesRestants.splice(piegeIndex, 1);
    }

    if (piegeDeclenche) {
        plateau.pieges_actifs = piegesRestants;
        await plateau.save();
    }

    await joueur.save();

    const caseArrivee = getCase(nouvellePosition);
    let messageAction;
    let pendingItemToReplace = null;
    if (isContinuation) {
        messageAction = `🚶 **<@${interaction.user.id}>** avance de **${de} case(s)** et atterrit sur la case **${caseArrivee.id} (${caseArrivee.type})** !`;
    } else {
        messageAction = `🎲 **<@${interaction.user.id}>** a fait un **${de}** et atterrit sur la case **${caseArrivee.id} (${caseArrivee.type})** !`;
    }

    if (piegeDeclenche) {
        if (piegeDeclenche.type === 'pieces') {
            const poseur = await Joueur.findByPk(piegeDeclenche.poseur);
            const montantVole = Math.min(10, joueur.pieces);
            joueur.pieces -= montantVole;
            if (poseur) {
                poseur.pieces += montantVole;
                await poseur.save();
                messageAction += `\n💥 **PIÈGE !** **${interaction.user.username}** tombe sur un piège à pièces et perd ${montantVole} pièces ! *(Reste: ${joueur.pieces} 🪙 | <@${poseur.discord_id}> a maintenant ${poseur.pieces} 🪙)*`;
            } else {
                messageAction += `\n💥 **PIÈGE !** **${interaction.user.username}** tombe sur un piège à pièces et perd ${montantVole} pièces ! *(Reste: ${joueur.pieces} 🪙)*`;
            }
        } else if (piegeDeclenche.type === 'etoile') {
            const poseur = await Joueur.findByPk(piegeDeclenche.poseur);
            if (joueur.etoiles > 0) {
                joueur.etoiles -= 1;
                if (poseur) {
                    poseur.etoiles += 1;
                    await poseur.save();
                    messageAction += `\n💥 **PIÈGE !** **${interaction.user.username}** tombe sur un piège à Étoile et perd 1 Étoile ! *(Reste: ${joueur.etoiles} ⭐ | <@${poseur.discord_id}> a maintenant ${poseur.etoiles} ⭐)*`;
                } else {
                    messageAction += `\n💥 **PIÈGE !** **${interaction.user.username}** tombe sur un piège à Étoile et perd 1 Étoile ! *(Reste: ${joueur.etoiles} ⭐)*`;
                }
            } else {
                messageAction += `\n💥 **PIÈGE !** **${interaction.user.username}** tombe sur un piège à Étoile mais n'a pas d'Étoile à voler !`;
            }
        }
    }

    if (!piegeDeclenche) {
        if (caseArrivee.type === 'Bleue') {
            joueur.pieces += 3;
            messageAction += `\n**${interaction.user.username}** gagne 3 pièces ! 💰 *(Total: ${joueur.pieces} 🪙)*`;
        } else if (caseArrivee.type === 'Rouge') {
            joueur.pieces = Math.max(0, joueur.pieces - 3);
            messageAction += `\n**${interaction.user.username}** perd 3 pièces ! 💸 *(Reste: ${joueur.pieces} 🪙)*`;
        } else if (caseArrivee.type === 'Chance') {
            const gains = [
                { type: 'pieces', val: 5, msg: '+5 pièces' },
                { type: 'pieces', val: 15, msg: '+15 pièces' },
                { type: 'objet', msg: '1 objet standard aléatoire' },
                { type: 'vol', val: 5, msg: 'Vol de 5 pièces à un joueur au hasard' },
                { type: 'sac', msg: 'Sac à objets (remplit l\'inventaire)' }
            ];
            const gain = gains[Math.floor(Math.random() * gains.length)];
            
            if (gain.type === 'pieces') {
                joueur.pieces += gain.val;
                messageAction += `\n🍀 **Chance !** **${interaction.user.username}** gagne ${gain.msg} ! *(Total: ${joueur.pieces} 🪙)*`;
            } else if (gain.type === 'objet') {
                const { ITEMS } = require('./items');
                const standardItems = Object.values(ITEMS).filter(i => !i.sundayOnly);
                const randomItem = standardItems[Math.floor(Math.random() * standardItems.length)];
                if (joueur.inventaire.length < 3) {
                    joueur.inventaire = [...joueur.inventaire, randomItem.name];
                    messageAction += `\n🍀 **Chance !** **${interaction.user.username}** obtient : ${randomItem.name} !`;
                } else {
                    messageAction += `\n🍀 **Chance !** **${interaction.user.username}** devait obtenir un objet mais son inventaire est plein !`;
                }
            } else if (gain.type === 'vol') {
                const tousLesJoueurs = await Joueur.findAll();
                const autresJoueurs = tousLesJoueurs.filter(j => j.discord_id !== joueur.discord_id && j.pieces > 0);
                if (autresJoueurs.length > 0) {
                    const cible = autresJoueurs[Math.floor(Math.random() * autresJoueurs.length)];
                    const montantVole = Math.min(gain.val, cible.pieces);
                    cible.pieces -= montantVole;
                    joueur.pieces += montantVole;
                    await cible.save();
                    messageAction += `\n🍀 **Chance !** **${interaction.user.username}** vole ${montantVole} pièces à <@${cible.discord_id}> ! *(${interaction.user.username} a ${joueur.pieces} 🪙 | <@${cible.discord_id}> a ${cible.pieces} 🪙)*`;
                } else {
                    messageAction += `\n🍀 **Chance !** **${interaction.user.username}** voulait voler des pièces mais personne n'en a !`;
                }
            } else if (gain.type === 'sac') {
                const { ITEMS } = require('./items');
                const standardItems = Object.values(ITEMS).filter(i => !i.sundayOnly);
                let newInv = [...joueur.inventaire];
                while (newInv.length < 3) {
                    const randomItem = standardItems[Math.floor(Math.random() * standardItems.length)];
                    newInv.push(randomItem.name);
                }
                joueur.inventaire = newInv;
                messageAction += `\n🍀 **Chance !** Son inventaire a été rempli au maximum !`;
            }
        } else if (caseArrivee.type === 'Malchance') {
            const pertes = [
                { type: 'pieces', val: -5, msg: '-5 pièces' },
                { type: 'pieces', val: -10, msg: '-10 pièces' },
                { type: 'objet', msg: 'Perte d\'un objet au hasard' },
                { type: 'de_limite', msg: 'Dé limité à 3 au prochain tour' },
                { type: 'tp_bowser', msg: 'Téléportation sur Bowser' }
            ];
            const perte = pertes[Math.floor(Math.random() * pertes.length)];
            
            if (perte.type === 'pieces') {
                joueur.pieces = Math.max(0, joueur.pieces + perte.val);
                messageAction += `\n🌩️ **Malchance !** **${interaction.user.username}** perd ${Math.abs(perte.val)} pièces ! *(Reste: ${joueur.pieces} 🪙)*`;
            } else if (perte.type === 'objet') {
                if (joueur.inventaire.length > 0) {
                    const inv = [...joueur.inventaire];
                    const indexToRemove = Math.floor(Math.random() * inv.length);
                    const removedItem = inv.splice(indexToRemove, 1)[0];
                    joueur.inventaire = inv;
                    messageAction += `\n🌩️ **Malchance !** **${interaction.user.username}** perd son objet : ${removedItem} !`;
                } else {
                    messageAction += `\n🌩️ **Malchance !** **${interaction.user.username}** devait perdre un objet mais son inventaire est vide !`;
                }
            } else if (perte.type === 'de_limite') {
                joueur.de_limite = true;
                messageAction += `\n🌩️ **Malchance !** Son dé sera limité à 3 au prochain tour !`;
            } else if (perte.type === 'tp_bowser') {
                let currentPos = joueur.position;
                let bowserPos = currentPos;
                for (let i = 1; i <= 42; i++) {
                    let checkPos = currentPos + i;
                    if (checkPos > 42) checkPos -= 42;
                    const c = getCase(checkPos);
                    if (c.type === 'Bowser') {
                        bowserPos = checkPos;
                        break;
                    }
                }
                joueur.position = bowserPos;
                joueur.pieces = Math.floor(joueur.pieces / 2);
                joueur.etoiles = Math.max(0, joueur.etoiles - 1);
                messageAction += `\n🌩️ **Malchance !** **${interaction.user.username}** est téléporté sur la case Bowser (${bowserPos}) ! 🔥 ${interaction.user.username} perd la moitié de ses pièces *(Reste: ${joueur.pieces} 🪙)* et 1 étoile *(Reste: ${joueur.etoiles} ⭐)* !`;
            }
        } else if (caseArrivee.type === 'Coup du Sort') {
            const events = [
                { type: 'echange_pos', msg: 'Échange de position avec un joueur aléatoire' },
                { type: 'loterie', msg: 'Un joueur tiré au sort gagne 20 pièces' },
                { type: 'etoile_filante', msg: 'L\'Étoile change immédiatement de case' },
                { type: 'roulette_vol', msg: 'Roulette de vol entre 2 joueurs' },
                { type: 'duel_des', msg: 'Duel de dés' },
                { type: 'don_pieces', msg: 'Don de 20 pièces à un joueur aléatoire' },
                { type: 'echange_pieces', msg: 'Échange de pièces avec un joueur aléatoire' },
                { type: 'echange_etoiles', msg: 'Échange d\'étoiles avec un joueur aléatoire' }
            ];
            const evt = events[Math.floor(Math.random() * events.length)];
            
            if (evt.type === 'echange_pos') {
                const tousLesJoueurs = await Joueur.findAll();
                const autresJoueurs = tousLesJoueurs.filter(j => j.discord_id !== joueur.discord_id);
                if (autresJoueurs.length > 0) {
                    const cible = autresJoueurs[Math.floor(Math.random() * autresJoueurs.length)];
                    const tempPos = joueur.position;
                    joueur.position = cible.position;
                    cible.position = tempPos;
                    await cible.save();
                    messageAction += `\n🎭 **Coup du Sort !** **${interaction.user.username}** échange sa position avec <@${cible.discord_id}> !`;
                } else {
                    messageAction += `\n🎭 **Coup du Sort !** **${interaction.user.username}** devait échanger sa position mais personne d'autre n'est sur le plateau !`;
                }
            } else if (evt.type === 'loterie') {
                const tousLesJoueurs = await Joueur.findAll();
                const cible = tousLesJoueurs[Math.floor(Math.random() * tousLesJoueurs.length)];
                cible.pieces += 20;
                await cible.save();
                messageAction += `\n🎭 **Coup du Sort !** Grande Loterie : <@${cible.discord_id}> gagne 20 pièces ! *(Total: ${cible.pieces} 🪙)*`;
            } else if (evt.type === 'etoile_filante') {
                let nouvellePositionEtoile;
                do {
                    nouvellePositionEtoile = Math.floor(Math.random() * 42) + 1;
                } while (nouvellePositionEtoile === plateau.position_etoile);
                plateau.position_etoile = nouvellePositionEtoile;
                await plateau.save();
                messageAction += `\n🎭 **Coup du Sort !** Étoile Filante : L'Étoile se déplace sur la case ${nouvellePositionEtoile} !`;
            } else if (evt.type === 'roulette_vol') {
                const tousLesJoueurs = await Joueur.findAll();
                const autresJoueurs = tousLesJoueurs.filter(j => j.discord_id !== joueur.discord_id);
                if (autresJoueurs.length > 0) {
                    const cible = autresJoueurs[Math.floor(Math.random() * autresJoueurs.length)];
                    const montant = Math.floor(Math.random() * 15) + 5;
                    const voleur = Math.random() > 0.5 ? joueur : cible;
                    const victime = voleur === joueur ? cible : joueur;
                    const volReel = Math.min(montant, victime.pieces);
                    victime.pieces -= volReel;
                    voleur.pieces += volReel;
                    await victime.save();
                    if (voleur.discord_id !== joueur.discord_id) await voleur.save();
                    messageAction += `\n🎭 **Coup du Sort !** Roulette de vol : <@${voleur.discord_id}> vole ${volReel} pièces à <@${victime.discord_id}> ! *(<@${voleur.discord_id}>: ${voleur.pieces} 🪙 | <@${victime.discord_id}>: ${victime.pieces} 🪙)*`;
                } else {
                    messageAction += `\n🎭 **Coup du Sort !** Roulette de vol annulée, pas assez de joueurs.`;
                }
            } else if (evt.type === 'duel_des') {
                const tousLesJoueurs = await Joueur.findAll();
                const autresJoueurs = tousLesJoueurs.filter(j => j.discord_id !== joueur.discord_id);
                if (autresJoueurs.length > 0) {
                    const cible = autresJoueurs[Math.floor(Math.random() * autresJoueurs.length)];
                    const deJoueur = Math.floor(Math.random() * 6) + 1;
                    const deCible = Math.floor(Math.random() * 6) + 1;
                    messageAction += `\n🎭 **Coup du Sort !** Duel de dés contre <@${cible.discord_id}> ! (**${interaction.user.username}**: ${deJoueur} 🎲 vs <@${cible.discord_id}>: ${deCible} 🎲)`;
                    if (deJoueur > deCible) {
                        const gain = Math.min(10, cible.pieces);
                        cible.pieces -= gain;
                        joueur.pieces += gain;
                        await cible.save();
                        messageAction += `\n🏆 **${interaction.user.username}** gagne le duel et vole ${gain} pièces ! *(${interaction.user.username}: ${joueur.pieces} 🪙 | <@${cible.discord_id}>: ${cible.pieces} 🪙)*`;
                    } else if (deCible > deJoueur) {
                        const gain = Math.min(10, joueur.pieces);
                        joueur.pieces -= gain;
                        cible.pieces += gain;
                        await cible.save();
                        messageAction += `\n🏆 <@${cible.discord_id}> gagne le duel et vole ${gain} pièces ! *(<@${cible.discord_id}>: ${cible.pieces} 🪙 | ${interaction.user.username}: ${joueur.pieces} 🪙)*`;
                    } else {
                        messageAction += `\n🤝 Égalité ! Rien ne se passe.`;
                    }
                } else {
                    messageAction += `\n🎭 **Coup du Sort !** Duel annulé, pas d'adversaire.`;
                }
            } else if (evt.type === 'don_pieces') {
                const tousLesJoueurs = await Joueur.findAll();
                const autresJoueurs = tousLesJoueurs.filter(j => j.discord_id !== joueur.discord_id);
                if (autresJoueurs.length > 0) {
                    const cible = autresJoueurs[Math.floor(Math.random() * autresJoueurs.length)];
                    const don = Math.min(20, joueur.pieces);
                    joueur.pieces -= don;
                    cible.pieces += don;
                    await cible.save();
                    messageAction += `\n🎭 **Coup du Sort !** **${interaction.user.username}** doit donner ${don} pièces à <@${cible.discord_id}> ! *(Reste: ${joueur.pieces} 🪙 | <@${cible.discord_id}> a ${cible.pieces} 🪙)*`;
                } else {
                    messageAction += `\n🎭 **Coup du Sort !** Don annulé, personne à qui donner.`;
                }
            } else if (evt.type === 'echange_pieces') {
                const tousLesJoueurs = await Joueur.findAll();
                const autresJoueurs = tousLesJoueurs.filter(j => j.discord_id !== joueur.discord_id);
                if (autresJoueurs.length > 0) {
                    const cible = autresJoueurs[Math.floor(Math.random() * autresJoueurs.length)];
                    const tempPieces = joueur.pieces;
                    joueur.pieces = cible.pieces;
                    cible.pieces = tempPieces;
                    await cible.save();
                    messageAction += `\n🎭 **Coup du Sort !** **${interaction.user.username}** échange ses pièces avec <@${cible.discord_id}> ! *(${interaction.user.username} a maintenant ${joueur.pieces} 🪙 | <@${cible.discord_id}> a ${cible.pieces} 🪙)*`;
                } else {
                    messageAction += `\n🎭 **Coup du Sort !** Échange annulé, pas d'adversaire.`;
                }
            } else if (evt.type === 'echange_etoiles') {
                const tousLesJoueurs = await Joueur.findAll();
                const autresJoueurs = tousLesJoueurs.filter(j => j.discord_id !== joueur.discord_id);
                if (autresJoueurs.length > 0) {
                    const cible = autresJoueurs[Math.floor(Math.random() * autresJoueurs.length)];
                    const tempEtoiles = joueur.etoiles;
                    joueur.etoiles = cible.etoiles;
                    cible.etoiles = tempEtoiles;
                    await cible.save();
                    messageAction += `\n🎭 **Coup du Sort !** **${interaction.user.username}** échange ses étoiles avec <@${cible.discord_id}> ! *(${interaction.user.username} a maintenant ${joueur.etoiles} ⭐ | <@${cible.discord_id}> a ${cible.etoiles} ⭐)*`;
                } else {
                    messageAction += `\n🎭 **Coup du Sort !** Échange annulé, pas d'adversaire.`;
                }
            }
        } else if (caseArrivee.type === 'Boo') {
            messageAction += `\n👻 **Boo !** **${interaction.user.username}** est tombé sur Boo ! Un choix de vol se présente à lui.`;
        } else if (caseArrivee.type === 'Bowser') {
            const bowserEvents = [
                { type: 'moitie_pieces', msg: 'Perte de la moitié des pièces' },
                { type: 'moins_etoile', msg: 'Perte d\'une étoile' },
                { type: 'revolution', msg: 'Révolution communiste des pièces du serveur' },
                { type: 'destruction_inv', msg: 'Destruction de l\'inventaire' },
                { type: 'don_dernier', msg: 'Don forcé au dernier' }
            ];
            const bEvt = bowserEvents[Math.floor(Math.random() * bowserEvents.length)];
            
            if (bEvt.type === 'moitie_pieces') {
                joueur.pieces = Math.floor(joueur.pieces / 2);
                messageAction += `\n🔥 **BOWSER !** **${interaction.user.username}** perd la moitié de ses pièces ! *(Reste: ${joueur.pieces} 🪙)* 🔥`;
            } else if (bEvt.type === 'moins_etoile') {
                joueur.etoiles = Math.max(0, joueur.etoiles - 1);
                messageAction += `\n🔥 **BOWSER !** **${interaction.user.username}** perd 1 étoile ! *(Reste: ${joueur.etoiles} ⭐)* 🔥`;
            } else if (bEvt.type === 'revolution') {
                const tousLesJoueurs = await Joueur.findAll();
                let totalPieces = 0;
                tousLesJoueurs.forEach(j => totalPieces += j.pieces);
                const part = Math.floor(totalPieces / tousLesJoueurs.length);
                for (const j of tousLesJoueurs) {
                    j.pieces = part;
                    await j.save();
                }
                messageAction += `\n🔥 **BOWSER !** Révolution communiste ! Toutes les pièces du serveur sont redistribuées équitablement (${part} pièces chacun) ! 🔥`;
            } else if (bEvt.type === 'destruction_inv') {
                joueur.inventaire = [];
                messageAction += `\n🔥 **BOWSER !** Destruction totale de son inventaire ! 🔥`;
            } else if (bEvt.type === 'don_dernier') {
                const tousLesJoueurs = await Joueur.findAll({ order: [['etoiles', 'ASC'], ['pieces', 'ASC']] });
                const dernier = tousLesJoueurs[0];
                if (dernier && dernier.discord_id !== joueur.discord_id) {
                    const don = Math.floor(joueur.pieces / 2);
                    joueur.pieces -= don;
                    dernier.pieces += don;
                    await dernier.save();
                    messageAction += `\n🔥 **BOWSER !** Don forcé ! **${interaction.user.username}** donne la moitié de ses pièces (${don}) au dernier du classement (<@${dernier.discord_id}>) ! *(Reste: ${joueur.pieces} 🪙 | <@${dernier.discord_id}> a ${dernier.pieces} 🪙)* 🔥`;
                } else {
                    messageAction += `\n🔥 **BOWSER !** **${interaction.user.username}** est déjà le dernier, Bowser a pitié de lui ! 🔥`;
                }
            }
        }
    }

    await joueur.save();

    const channel = interaction.client.channels.cache.get(config.boardChannelId);
    if (channel) {
        let tousLesJoueurs = await Joueur.findAll();
        tousLesJoueurs = tousLesJoueurs.sort((a, b) => {
            if (a.discord_id === interaction.user.id) return 1;
            if (b.discord_id === interaction.user.id) return -1;
            return 0;
        });
        const buffer = await generateBoardImage(tousLesJoueurs, plateau, interaction.client);
        const attachment = new AttachmentBuilder(buffer, { name: 'board.png' });
        await channel.send({ content: messageAction, files: [attachment] });
    }

    if (caseArrivee.type === 'Boo') {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('boo_pieces')
                    .setLabel('Voler des pièces (Gratuit)')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('boo_etoile')
                    .setLabel('Voler une Étoile (50 pièces)')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(joueur.pieces < 50)
            );
            
        const replyContent = { content: `👻 **Boo !** Que veux-tu faire ?\n- Voler des pièces (3 à 12) gratuitement\n- Voler une Étoile pour 50 pièces`, components: [row] };
            if (isContinuation) await interaction.followUp({ ...replyContent, ephemeral: true });
            else await interaction.editReply(replyContent);
    } else {
        const replyContent = { content: `Tu as atterri sur la case ${caseArrivee.id} ! Regarde le salon <#${config.boardChannelId}> pour voir le résultat.` };
            if (isContinuation) await interaction.followUp({ ...replyContent, ephemeral: true });
            else await interaction.editReply(replyContent);
    }
}
async function handleAcheterEtoile(interaction) {
    const joueur = await Joueur.findByPk(interaction.user.id);
    if (!joueur || joueur.pieces < 20) {
        return interaction.reply({ content: 'Tu n\'as pas assez de pièces ou une erreur est survenue.', ephemeral: true });
    }

    joueur.pieces -= 20;
    joueur.etoiles += 1;
    await joueur.save();

    const plateau = await Plateau.findByPk(1);
    const oldPosition = plateau.etoile_position;
    
    do {
        plateau.etoile_position = Math.floor(Math.random() * 42) + 1;
    } while (plateau.etoile_position === oldPosition);
    
    await plateau.save();

    await interaction.channel.send(`⭐ **Bravo !** <@${interaction.user.id}> a acheté une Étoile ! 🌟 L'Étoile s'envole vers la case ${plateau.etoile_position} !`);

    if (joueur.cases_restantes > 0) {
        await interaction.update({ content: '⭐ **Bravo !** Tu as acheté une Étoile !', components: [] }).catch(()=>{});
        await handleContinuerDeplacement(interaction);
    } else {
        await interaction.update({ content: '⭐ **Bravo !** Tu as acheté une Étoile !', components: [] }).catch(()=>{});
    }
}

async function handlePasserEtoile(interaction) {
    const joueur = await Joueur.findByPk(interaction.user.id);
    if (joueur && joueur.cases_restantes > 0) {
        await interaction.update({ content: "Tu as passé ton tour pour l'Étoile.", components: [] }).catch(() => {});
        await handleContinuerDeplacement(interaction);
    } else {
        await interaction.update({ content: "Tu as passé ton tour pour l'Étoile.", components: [] }).catch(() => {});
    }
}

async function handleUtiliserObjet(interaction) {
    const joueur = await Joueur.findByPk(interaction.user.id);
    if (!joueur || !joueur.inventaire || joueur.inventaire.length === 0) {
        return interaction.reply({ content: 'Ton inventaire est vide.', ephemeral: true });
    }

    const plateau = await Plateau.findByPk(1);
    if (plateau && plateau.enigme_status === 'active') {
        return interaction.reply({ content: "Le plateau est verrouillé ! Il faut d'abord résoudre l'énigme du jour.", ephemeral: true });
    }
    
    // Si c'est pas son tour ou s'il a déjà joué
    const isSaturday = new Date().getDay() === 6;
    if (!joueur.a_le_droit_de_jouer || isSaturday) {
        return interaction.reply({ content: "Tu ne peux pas utiliser d'objet pour le moment (tu as déjà joué ou c'est bloqué).", ephemeral: true });
    }

    const { ITEMS } = require('./items');
    const row = new ActionRowBuilder();
    
    // On crée un bouton pour chaque objet de l'inventaire
    // Attention aux doublons, on utilise l'index
    joueur.inventaire.forEach((itemName, index) => {
        const itemKey = Object.keys(ITEMS).find(key => ITEMS[key].name === itemName);
        if (itemKey) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`use_${itemKey}_${index}`)
                    .setLabel(itemName)
                    .setStyle(ButtonStyle.Primary)
            );
        }
    });

    await interaction.reply({ 
        content: `**Ton inventaire :**\nTu es sur la case **${joueur.position}**. L'Étoile est sur la case **${plateau.position_etoile}**.\nQuel objet veux-tu utiliser ?`, 
        components: [row], 
        ephemeral: true 
    });
}

async function handleUseItem(interaction) {
    const parts = interaction.customId.split('_');
    const itemIndexStr = parts.pop(); // extracts the last part (e.g. '0')
    const itemKey = parts.slice(1).join('_'); // recombines the rest (e.g. 'PIEGE_PIECES')
    const itemIndex = parseInt(itemIndexStr);

    const joueur = await Joueur.findByPk(interaction.user.id);
    if (!joueur || !joueur.inventaire || joueur.inventaire.length <= itemIndex) {
        return interaction.reply({ content: 'Erreur avec ton inventaire.', ephemeral: true });
    }

    const { ITEMS } = require('./items');
    const item = ITEMS[itemKey];
    if (!item) return interaction.reply({ content: 'Objet inconnu.', ephemeral: true });

    // Retirer l'objet de l'inventaire
    const newInv = [...joueur.inventaire];
    newInv.splice(itemIndex, 1);
    joueur.inventaire = newInv;

    let message = `Tu as utilisé **${item.name}** ! `;
    const channel = interaction.client.channels.cache.get(config.boardChannelId);

    // Appliquer l'effet de l'objet
    if (item.id === 'champignon') {
        joueur.bonus_prochain_lancer = 3;
        message += 'Ton prochain lancer aura +3 !';
    } else if (item.id === 'piege_pieces') {
        const plateau = await Plateau.findByPk(1);
        const pieges = [...plateau.pieges_actifs];
        pieges.push({ position: joueur.position, type: 'pieces', poseur: joueur.discord_id });
        plateau.pieges_actifs = pieges;
        await plateau.save();
        message += `Un piège à pièces a été posé sur la case ${joueur.position} !`;
    } else if (item.id === 'tuyau') {
        joueur.position = Math.floor(Math.random() * 42) + 1;
        message += `Tu as été téléporté sur la case ${joueur.position} !`;
        if (channel) channel.send(`🧪 <@${joueur.discord_id}> a utilisé un Tuyau et atterrit sur la case ${joueur.position} !`);
    } else if (item.id === 'miroir') {
        const tousLesJoueurs = await Joueur.findAll();
        const autresJoueurs = tousLesJoueurs.filter(j => j.discord_id !== joueur.discord_id);
        if (autresJoueurs.length > 0) {
            const cible = autresJoueurs[Math.floor(Math.random() * autresJoueurs.length)];
            const tempPos = joueur.position;
            joueur.position = cible.position;
            cible.position = tempPos;
            await cible.save();
            message += `Tu as échangé ta position avec <@${cible.discord_id}> !`;
            if (channel) channel.send(`🪞 <@${joueur.discord_id}> a utilisé un Miroir et échangé sa place avec <@${cible.discord_id}> !`);
        } else {
            message += `Mais il n'y a personne avec qui échanger !`;
        }
    } else if (item.id === 'sifflet') {
        const plateau = await Plateau.findByPk(1);
        let nouvellePositionEtoile;
        do {
            nouvellePositionEtoile = Math.floor(Math.random() * 42) + 1;
        } while (nouvellePositionEtoile === plateau.position_etoile);
        plateau.position_etoile = nouvellePositionEtoile;
        await plateau.save();
        message += `L'Étoile s'est déplacée !`;
        if (channel) channel.send(`🎺 <@${joueur.discord_id}> a utilisé un Sifflet ! L'Étoile se déplace sur la case ${nouvellePositionEtoile} !`);
    } else if (item.id === 'double_de') {
        joueur.type_de = 'double';
        message += `Ton prochain lancer sera entre 2 et 12 !`;
    } else if (item.id === 'de_triple') {
        joueur.type_de = 'triple';
        message += `Ton prochain lancer sera entre 3 et 18 !`;
    } else if (item.id === 'piege_etoile') {
        const plateau = await Plateau.findByPk(1);
        const pieges = [...plateau.pieges_actifs];
        pieges.push({ position: joueur.position, type: 'etoile', poseur: joueur.discord_id });
        plateau.pieges_actifs = pieges;
        await plateau.save();
        message += `Un piège à Étoile a été posé sur la case ${joueur.position} !`;
    } else if (item.id === 'tuyau_dore') {
        const plateau = await Plateau.findByPk(1);
        let posDevant = plateau.position_etoile - 1;
        if (posDevant <= 0) posDevant += 42;
        joueur.position = posDevant;
        message += `Tu as été téléporté juste devant l'Étoile (case ${posDevant}) !`;
        if (channel) channel.send(`🏆 <@${joueur.discord_id}> a utilisé un Tuyau Doré et atterrit devant l'Étoile !`);
    } else if (item.id === 'de_pipe') {
        // Pour le dé pipé, on doit demander la valeur
        const { StringSelectMenuBuilder } = require('discord.js');
        const select = new StringSelectMenuBuilder()
            .setCustomId('de_pipe_choix')
            .setPlaceholder('Choisis la valeur de ton dé')
            .addOptions([
                { label: '1', value: '1' },
                { label: '2', value: '2' },
                { label: '3', value: '3' },
                { label: '4', value: '4' },
                { label: '5', value: '5' },
                { label: '6', value: '6' }
            ]);
        const row = new ActionRowBuilder().addComponents(select);
        await joueur.save();
        return interaction.reply({ content: `Tu as utilisé **Dé pipé** ! Quelle valeur veux-tu ?`, components: [row], ephemeral: true });
    } else {
        message += `(Effet non implémenté pour le moment)`;
    }

    await joueur.save();
    await interaction.reply({ content: message, ephemeral: true });
}

async function handleDePipeChoix(interaction) {
    const valeur = parseInt(interaction.values[0]);
    const joueur = await Joueur.findByPk(interaction.user.id);
    joueur.type_de = 'pipe';
    joueur.de_pipe_valeur = valeur;
    await joueur.save();
    await interaction.reply({ content: `Ton prochain lancer fera exactement ${valeur} !`, ephemeral: true });
}

async function handleBooChoice(interaction) {
    const type = interaction.customId.split('_')[1]; // 'pieces' ou 'etoile'
    const joueur = await Joueur.findByPk(interaction.user.id);
    
    if (type === 'etoile' && joueur.pieces < 50) {
        return interaction.reply({ content: 'Tu n\'as pas assez de pièces pour voler une étoile.', ephemeral: true });
    }

    const tousLesJoueurs = await Joueur.findAll();
    const ciblesPotentielles = tousLesJoueurs.filter(j => j.discord_id !== joueur.discord_id && (type === 'pieces' ? j.pieces > 0 : j.etoiles > 0));

    if (ciblesPotentielles.length === 0) {
        return interaction.reply({ content: `Personne n'a de ${type} à voler !`, ephemeral: true });
    }

    const { StringSelectMenuBuilder } = require('discord.js');
    
    const options = await Promise.all(ciblesPotentielles.map(async j => {
        const user = await interaction.client.users.fetch(j.discord_id).catch(() => null);
        const username = user ? user.username : `Joueur ${j.discord_id.substring(0, 5)}`;
        return {
            label: `${username} (${type === 'pieces' ? j.pieces + ' pièces' : j.etoiles + ' étoiles'})`,
            value: j.discord_id
        };
    }));

    const select = new StringSelectMenuBuilder()
        .setCustomId(`boo_target_${type}`)
        .setPlaceholder('Choisis ta cible')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(select);
    await interaction.reply({ content: `Qui veux-tu voler ?`, components: [row], ephemeral: true });
}

async function handleBooTarget(interaction) {
    const type = interaction.customId.split('_')[2]; // 'pieces' ou 'etoile'
    const cibleId = interaction.values[0];
    
    const joueur = await Joueur.findByPk(interaction.user.id);
    const cible = await Joueur.findByPk(cibleId);

    if (!cible) return interaction.reply({ content: 'Cible introuvable.', ephemeral: true });

    let messageAction = '';
    if (type === 'pieces') {
        const montantVole = Math.floor(Math.random() * 10) + 3; // 3 à 12
        const volReel = Math.min(montantVole, cible.pieces);
        cible.pieces -= volReel;
        joueur.pieces += volReel;
        messageAction = `👻 **Boo !** <@${joueur.discord_id}> a volé ${volReel} pièces à <@${cible.discord_id}> ! *(${interaction.user.username}: ${joueur.pieces} 🪙 | <@${cible.discord_id}>: ${cible.pieces} 🪙)*`;
    } else if (type === 'etoile') {
        if (joueur.pieces < 50) return interaction.reply({ content: 'Tu n\'as plus assez de pièces.', ephemeral: true });
        if (cible.etoiles < 1) return interaction.reply({ content: 'La cible n\'a plus d\'étoile.', ephemeral: true });
        
        joueur.pieces -= 50;
        cible.etoiles -= 1;
        joueur.etoiles += 1;
        messageAction = `👻 **Boo !** <@${joueur.discord_id}> a payé 50 pièces pour voler une Étoile à <@${cible.discord_id}> ! *(${interaction.user.username}: ${joueur.etoiles} ⭐ | <@${cible.discord_id}>: ${cible.etoiles} ⭐)*`;
    }

    await joueur.save();
    await cible.save();

    await interaction.reply({ content: 'Vol effectué !', ephemeral: true });
    
    const channel = interaction.client.channels.cache.get(config.boardChannelId);
    if (channel) {
        await channel.send(messageAction);
    }
}

async function handleBuyItem(interaction) {
    const joueur = await Joueur.findByPk(interaction.user.id);
    const itemId = interaction.customId.replace('buy_', '');

    if (!joueur) return interaction.reply({ content: 'Erreur joueur.', ephemeral: true });

    const { ITEMS } = require('./items');
    const itemKey = Object.keys(ITEMS).find(k => ITEMS[k].id === itemId);
    const item = ITEMS[itemKey];

    if (!item) return interaction.reply({ content: 'Objet inconnu.', ephemeral: true });

    if (joueur.pieces < item.price) {
        return interaction.reply({ content: 'Tu n\'as pas assez de pièces.', ephemeral: true });
    }

    if (item.isPack) {
        if (joueur.inventaire.length + item.contents.length > 3) {
            return interaction.reply({ content: `Ton inventaire est trop plein pour ce pack (il te faut ${item.contents.length} places libres).`, ephemeral: true });
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
            await interaction.update({ content: `🛒 Tu as acheté **${item.name}** !`, components: [] }).catch(()=>{});
            await handleContinuerDeplacement(interaction);
        } else {
            return interaction.update({ content: `🛒 Tu as acheté **${item.name}** ! Il te reste **${joueur.pieces} pièces**.`, components: [] }).catch(()=>{});
        }
    } else {
        if (joueur.inventaire.length >= 3) {
            const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const row = new ActionRowBuilder();
            const options = joueur.inventaire.map((itemName, index) => {
                return {
                    label: `Jeter l'objet ${index + 1}: ${itemName}`,
                    value: index.toString(),
                };
            });
            const selectOptions = new StringSelectMenuBuilder()
                .setCustomId(`replace_buy_${item.id}`)
                .setPlaceholder('Choisir un objet à jeter')
                .addOptions(options);

            row.addComponents(selectOptions);

            const row2 = new ActionRowBuilder();
            row2.addComponents(
                new ButtonBuilder()
                    .setCustomId('buy_cancel')
                    .setLabel('Annuler l\'achat')
                    .setStyle(ButtonStyle.Danger)
            );

            return interaction.update({ 
                content: `Ton inventaire est plein ! Quel objet veux-tu jeter pour acheter **${item.name}** (${item.price} pièces) ?`, 
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
            await interaction.update({ content: `🛒 Tu as acheté **${item.name}** !`, components: [] }).catch(()=>{});
            await handleContinuerDeplacement(interaction);
        } else {
            return interaction.update({ content: `🛒 Tu as acheté **${item.name}** ! Il te reste **${joueur.pieces} pièces**.`, components: [] }).catch(()=>{});
        }
    }
}

async function handleBuyCancel(interaction) {
    const joueur = await Joueur.findByPk(interaction.user.id);
    if (joueur && joueur.cases_restantes > 0) {
        await interaction.update({ content: 'Tu as quitté la boutique, en route !', components: [] }).catch(()=>{});
        await handleContinuerDeplacement(interaction);
    } else {
        await interaction.update({ content: 'Tu as quitté la boutique.', components: [] }).catch(()=>{});
    }
}


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
        return interaction.update({ content: 'Tu n\'as plus assez de pièces.', components: [] }).catch(()=>{});
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
        await interaction.update({ content: `🛒 Tu as jeté **${droppedItem}** et acheté **${item.name}** !`, components: [] }).catch(()=>{});
        await handleContinuerDeplacement(interaction);
    } else {
        await interaction.update({ content: `🛒 Tu as jeté **${droppedItem}** et acheté **${item.name}** ! Il te reste **${joueur.pieces} pièces**.`, components: [] }).catch(()=>{});
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
    
    await interaction.update({ content: `🗑️ Tu as jeté **${droppedItem}** et gardé **${item.name}** !`, components: [] }).catch(()=>{});
}

module.exports = {
    handleLancerDe,
    handleContinuerDeplacement,
    handleAcheterEtoile,
    handlePasserEtoile,
    handleUtiliserObjet,
    handleUseItem,
    handleDePipeChoix,
    handleBooChoice,
    handleBooTarget,
    handleBuyItem,
    handleBuyCancel,
    handleReplaceBuy,
    handleReplaceChance
};
