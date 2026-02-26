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

    const anciennePosition = joueur.position;
    
    // Calculer la nouvelle position
    let nouvellePosition = anciennePosition + de;
    if (nouvellePosition > 42) nouvellePosition -= 42;

    // Vérifier si le joueur passe par l'étoile
    const plateau = await Plateau.findByPk(1);
    const casesParcourues = getCasesInRange(anciennePosition, nouvellePosition);
    
    // Vérifier les pièges sur la case d'arrivée (il faut s'arrêter pile dessus)
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

    let aPasseEtoile = false;
    for (const c of casesParcourues) {
        if (c.id === plateau.position_etoile && c.id !== anciennePosition) {
            aPasseEtoile = true;
            break;
        }
    }

    joueur.position = nouvellePosition;
    joueur.a_le_droit_de_jouer = false; // Il a joué pour aujourd'hui
    await joueur.save();

    const caseArrivee = getCase(nouvellePosition);
    let messageAction = `<@${interaction.user.id}> a lancé un **${de}** et atterrit sur la case **${caseArrivee.id} (${caseArrivee.type})** !`;

    if (piegeDeclenche) {
        if (piegeDeclenche.type === 'pieces') {
            const poseur = await Joueur.findByPk(piegeDeclenche.poseur);
            const montantVole = Math.min(10, joueur.pieces);
            joueur.pieces -= montantVole;
            if (poseur) {
                poseur.pieces += montantVole;
                await poseur.save();
                messageAction += `\n💥 **PIÈGE !** Il tombe sur un piège à pièces et perd ${montantVole} pièces ! *(Il lui reste ${joueur.pieces} 🪙 | <@${poseur.discord_id}> a maintenant ${poseur.pieces} 🪙)*`;
            } else {
                messageAction += `\n💥 **PIÈGE !** Il tombe sur un piège à pièces et perd ${montantVole} pièces ! *(Il lui reste ${joueur.pieces} 🪙)*`;
            }
        } else if (piegeDeclenche.type === 'etoile') {
            const poseur = await Joueur.findByPk(piegeDeclenche.poseur);
            if (joueur.etoiles > 0) {
                joueur.etoiles -= 1;
                if (poseur) {
                    poseur.etoiles += 1;
                    await poseur.save();
                    messageAction += `\n💥 **PIÈGE !** Il tombe sur un piège à Étoile et perd 1 Étoile ! *(Il lui reste ${joueur.etoiles} ⭐ | <@${poseur.discord_id}> a maintenant ${poseur.etoiles} ⭐)*`;
                } else {
                    messageAction += `\n💥 **PIÈGE !** Il tombe sur un piège à Étoile et perd 1 Étoile ! *(Il lui reste ${joueur.etoiles} ⭐)*`;
                }
            } else {
                messageAction += `\n💥 **PIÈGE !** Il tombe sur un piège à Étoile mais n'a pas d'Étoile à voler !`;
            }
        }
    }

    // Appliquer l'effet de la case (seulement si on n'est pas tombé sur un piège, ou on peut cumuler)
    if (!piegeDeclenche) {
        if (caseArrivee.type === 'Bleue') {
        joueur.pieces += 3;
        messageAction += `\nIl gagne 3 pièces ! 💰 *(Total: ${joueur.pieces} 🪙)*`;
    } else if (caseArrivee.type === 'Rouge') {
        joueur.pieces = Math.max(0, joueur.pieces - 3);
        messageAction += `\nIl perd 3 pièces ! 💸 *(Reste: ${joueur.pieces} 🪙)*`;
    } else if (caseArrivee.type === 'Chance') {
        // Roulette chance
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
            messageAction += `\n🍀 **Chance !** Il gagne ${gain.msg} ! *(Total: ${joueur.pieces} 🪙)*`;
        } else if (gain.type === 'objet') {
            const { ITEMS } = require('./items');
            const standardItems = Object.values(ITEMS).filter(i => !i.sundayOnly);
            const randomItem = standardItems[Math.floor(Math.random() * standardItems.length)];
            if (joueur.inventaire.length < 3) {
                joueur.inventaire = [...joueur.inventaire, randomItem.name];
                messageAction += `\n🍀 **Chance !** Il obtient : ${randomItem.name} !`;
            } else {
                messageAction += `\n🍀 **Chance !** Il devait obtenir un objet mais son inventaire est plein !`;
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
                messageAction += `\n🍀 **Chance !** Il vole ${montantVole} pièces à <@${cible.discord_id}> ! *(Il a ${joueur.pieces} 🪙 | <@${cible.discord_id}> a ${cible.pieces} 🪙)*`;
            } else {
                messageAction += `\n🍀 **Chance !** Il voulait voler des pièces mais personne n'en a !`;
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
        // Roulette malchance
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
            messageAction += `\n🌩️ **Malchance !** Il perd ${Math.abs(perte.val)} pièces ! *(Reste: ${joueur.pieces} 🪙)*`;
        } else if (perte.type === 'objet') {
            if (joueur.inventaire.length > 0) {
                const inv = [...joueur.inventaire];
                const indexToRemove = Math.floor(Math.random() * inv.length);
                const removedItem = inv.splice(indexToRemove, 1)[0];
                joueur.inventaire = inv;
                messageAction += `\n🌩️ **Malchance !** Il perd son objet : ${removedItem} !`;
            } else {
                messageAction += `\n🌩️ **Malchance !** Il devait perdre un objet mais son inventaire est vide !`;
            }
        } else if (perte.type === 'de_limite') {
            joueur.de_limite = true;
            messageAction += `\n🌩️ **Malchance !** Son dé sera limité à 3 au prochain tour !`;
        } else if (perte.type === 'tp_bowser') {
            // Trouver la case Bowser la plus proche (en avançant)
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
            messageAction += `\n🌩️ **Malchance !** Il est téléporté sur la case Bowser (${bowserPos}) ! 🔥 Il perd la moitié de ses pièces *(Reste: ${joueur.pieces} 🪙)* et 1 étoile *(Reste: ${joueur.etoiles} ⭐)* !`;
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
                messageAction += `\n🎭 **Coup du Sort !** Il échange sa position avec <@${cible.discord_id}> !`;
            } else {
                messageAction += `\n🎭 **Coup du Sort !** Il devait échanger sa position mais il est seul sur le plateau !`;
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
                const montant = Math.floor(Math.random() * 15) + 5; // 5 à 20 pièces
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
                messageAction += `\n🎭 **Coup du Sort !** Duel de dés contre <@${cible.discord_id}> ! (<@${joueur.discord_id}>: ${deJoueur} 🎲 vs <@${cible.discord_id}>: ${deCible} 🎲)`;
                if (deJoueur > deCible) {
                    const gain = Math.min(10, cible.pieces);
                    cible.pieces -= gain;
                    joueur.pieces += gain;
                    await cible.save();
                    messageAction += `\n🏆 <@${joueur.discord_id}> gagne le duel et vole ${gain} pièces ! *(<@${joueur.discord_id}>: ${joueur.pieces} 🪙 | <@${cible.discord_id}>: ${cible.pieces} 🪙)*`;
                } else if (deCible > deJoueur) {
                    const gain = Math.min(10, joueur.pieces);
                    joueur.pieces -= gain;
                    cible.pieces += gain;
                    await cible.save();
                    messageAction += `\n🏆 <@${cible.discord_id}> gagne le duel et vole ${gain} pièces ! *(<@${cible.discord_id}>: ${cible.pieces} 🪙 | <@${joueur.discord_id}>: ${joueur.pieces} 🪙)*`;
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
                messageAction += `\n🎭 **Coup du Sort !** Il doit donner ${don} pièces à <@${cible.discord_id}> ! *(Il lui reste ${joueur.pieces} 🪙 | <@${cible.discord_id}> a ${cible.pieces} 🪙)*`;
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
                messageAction += `\n🎭 **Coup du Sort !** Il échange ses pièces avec <@${cible.discord_id}> ! *(Il a maintenant ${joueur.pieces} 🪙 | <@${cible.discord_id}> a ${cible.pieces} 🪙)*`;
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
                messageAction += `\n🎭 **Coup du Sort !** Il échange ses étoiles avec <@${cible.discord_id}> ! *(Il a maintenant ${joueur.etoiles} ⭐ | <@${cible.discord_id}> a ${cible.etoiles} ⭐)*`;
            } else {
                messageAction += `\n🎭 **Coup du Sort !** Échange annulé, pas d'adversaire.`;
            }
        }
    } else if (caseArrivee.type === 'Boo') {
        messageAction += `\n👻 **Boo !** Il est tombé sur Boo ! Regarde tes messages privés pour choisir ta cible.`;
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
            messageAction += `\n🔥 **BOWSER !** Il perd la moitié de ses pièces ! *(Reste: ${joueur.pieces} 🪙)* 🔥`;
        } else if (bEvt.type === 'moins_etoile') {
            joueur.etoiles = Math.max(0, joueur.etoiles - 1);
            messageAction += `\n🔥 **BOWSER !** Il perd 1 étoile ! *(Reste: ${joueur.etoiles} ⭐)* 🔥`;
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
                messageAction += `\n🔥 **BOWSER !** Don forcé ! Il donne la moitié de ses pièces (${don}) au dernier du classement (<@${dernier.discord_id}>) ! *(Il lui reste ${joueur.pieces} 🪙 | <@${dernier.discord_id}> a ${dernier.pieces} 🪙)* 🔥`;
            } else {
                messageAction += `\n🔥 **BOWSER !** Il est déjà le dernier, Bowser a pitié de lui ! 🔥`;
            }
        }
    } else if (caseArrivee.type === 'Boutique') {
        messageAction += `\n🛒 Il est arrivé à la Boutique ! Regarde tes messages privés.`;
        // On gère la boutique après l'envoi du message public
    }
    } // Fin du if (!piegeDeclenche)

    await joueur.save();

    // Si le joueur est passé devant l'étoile
    if (aPasseEtoile) {
        if (joueur.pieces >= 20) {
            // Proposer d'acheter l'étoile
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('acheter_etoile')
                        .setLabel('Acheter l\'Étoile (20 pièces)')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('passer_etoile')
                        .setLabel('Passer')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            await interaction.editReply({
                content: `Tu passes devant l'Étoile ! Veux-tu l'acheter pour 20 pièces ? (Tu as ${joueur.pieces} pièces)`,
                components: [row]
            });
            
            // On envoie quand même le message public
            const channel = interaction.client.channels.cache.get(config.boardChannelId);
            if (channel) {
                const tousLesJoueurs = await Joueur.findAll();
                const buffer = await generateBoardImage(tousLesJoueurs, plateau, interaction.client);
                const attachment = new AttachmentBuilder(buffer, { name: 'board.png' });
                await channel.send({ content: messageAction, files: [attachment] });
            }
            return;
        } else {
            messageAction += `\nIl est passé devant l'Étoile mais n'avait pas assez de pièces (20 requises).`;
        }
    }

    // Envoyer le message public dans #plateau
    const channel = interaction.client.channels.cache.get(config.boardChannelId);
    if (channel) {
        const tousLesJoueurs = await Joueur.findAll();
        const buffer = await generateBoardImage(tousLesJoueurs, plateau, interaction.client);
        const attachment = new AttachmentBuilder(buffer, { name: 'board.png' });
        await channel.send({ content: messageAction, files: [attachment] });
    }

    if (caseArrivee.type === 'Boutique') {
        const { generateShop } = require('./shop');
        const shopItems = await generateShop(joueur.discord_id);
        
        const row = new ActionRowBuilder();
        let shopMsg = '🛒 **Bienvenue à la Boutique !** Voici ce que je te propose :\n\n';
        
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

        await interaction.editReply({ content: shopMsg, components: [row] });
    } else if (caseArrivee.type === 'Boo') {
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
            
        await interaction.editReply({
            content: `👻 **Boo !** Que veux-tu faire ?\n- Voler des pièces (3 à 12) gratuitement\n- Voler une Étoile pour 50 pièces`,
            components: [row]
        });
    } else {
        await interaction.editReply({ content: `Tu as lancé un ${de} ! Regarde le salon <#${config.boardChannelId}> pour voir le résultat.` });
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

    // Déplacer l'étoile
    const plateau = await Plateau.findByPk(1);
    let nouvellePositionEtoile;
    do {
        nouvellePositionEtoile = Math.floor(Math.random() * 42) + 1;
    } while (nouvellePositionEtoile === plateau.position_etoile);
    
    plateau.position_etoile = nouvellePositionEtoile;
    await plateau.save();

    await interaction.reply({ content: `Tu as acheté une Étoile ! ⭐ (Il te reste ${joueur.pieces} 🪙)`, ephemeral: true });

    const channel = interaction.client.channels.cache.get(config.boardChannelId);
    if (channel) {
        await channel.send(`⭐ **<@${interaction.user.id}> a acheté une Étoile !** *(Total: ${joueur.etoiles} ⭐ | Reste: ${joueur.pieces} 🪙)*\nL'Étoile s'est déplacée sur la case ${nouvellePositionEtoile}.`);
    }
}

async function handlePasserEtoile(interaction) {
    await interaction.reply({ content: 'Tu as passé ton tour pour l\'Étoile.', ephemeral: true });
}

async function handleUtiliserObjet(interaction) {
    const joueur = await Joueur.findByPk(interaction.user.id);
    if (!joueur || !joueur.inventaire || joueur.inventaire.length === 0) {
        return interaction.reply({ content: 'Ton inventaire est vide.', ephemeral: true });
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

    const plateau = await Plateau.findByPk(1);
    
    await interaction.reply({ 
        content: `**Ton inventaire :**\nTu es sur la case **${joueur.position}**. L'Étoile est sur la case **${plateau.position_etoile}**.\nQuel objet veux-tu utiliser ?`, 
        components: [row], 
        ephemeral: true 
    });
}

async function handleUseItem(interaction) {
    const parts = interaction.customId.split('_');
    const itemKey = parts[1];
    const itemIndex = parseInt(parts[2]);

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
    const select = new StringSelectMenuBuilder()
        .setCustomId(`boo_target_${type}`)
        .setPlaceholder('Choisis ta cible')
        .addOptions(ciblesPotentielles.map(j => ({
            label: `Joueur ${j.discord_id.substring(0, 5)}... (${type === 'pieces' ? j.pieces + ' pièces' : j.etoiles + ' étoiles'})`,
            value: j.discord_id
        })));

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
        messageAction = `👻 **Boo !** <@${joueur.discord_id}> a volé ${volReel} pièces à <@${cible.discord_id}> ! *(<@${joueur.discord_id}>: ${joueur.pieces} 🪙 | <@${cible.discord_id}>: ${cible.pieces} 🪙)*`;
    } else if (type === 'etoile') {
        if (joueur.pieces < 50) return interaction.reply({ content: 'Tu n\'as plus assez de pièces.', ephemeral: true });
        if (cible.etoiles < 1) return interaction.reply({ content: 'La cible n\'a plus d\'étoile.', ephemeral: true });
        
        joueur.pieces -= 50;
        cible.etoiles -= 1;
        joueur.etoiles += 1;
        messageAction = `👻 **Boo !** <@${joueur.discord_id}> a payé 50 pièces pour voler une Étoile à <@${cible.discord_id}> ! *(<@${joueur.discord_id}>: ${joueur.etoiles} ⭐ | <@${cible.discord_id}>: ${cible.etoiles} ⭐)*`;
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
    const itemId = interaction.customId.split('_')[1];
    const joueur = await Joueur.findByPk(interaction.user.id);
    
    if (!joueur) return interaction.reply({ content: 'Erreur joueur.', ephemeral: true });

    const { ITEMS } = require('./items');
    const itemKey = Object.keys(ITEMS).find(k => ITEMS[k].id === itemId);
    const item = ITEMS[itemKey];

    if (!item) return interaction.reply({ content: 'Objet inconnu.', ephemeral: true });

    if (joueur.pieces < item.price) {
        return interaction.reply({ content: 'Tu n\'as pas assez de pièces.', ephemeral: true });
    }

    if (item.isPack) {
        // Vérifier si l'inventaire peut accueillir le pack
        if (joueur.inventaire.length + item.contents.length > 3) {
            return interaction.reply({ content: `Ton inventaire est trop plein pour ce pack (il te faut ${item.contents.length} places libres).`, ephemeral: true });
        }
        
        joueur.pieces -= item.price;
        const newInv = [...joueur.inventaire];
        for (const contentKey of item.contents) {
            newInv.push(ITEMS[contentKey].name);
        }
        joueur.inventaire = newInv;
        
        // Retirer le pack de la boutique du jour
        if (joueur.boutique_du_jour) {
            joueur.boutique_du_jour = joueur.boutique_du_jour.filter(id => id !== item.id);
        }
        
        await joueur.save();
        return interaction.reply({ content: `Tu as acheté le **${item.name}** ! Il te reste **${joueur.pieces} pièces**.`, ephemeral: true });
    } else {
        if (joueur.inventaire.length >= 3) {
            return interaction.reply({ content: 'Ton inventaire est plein (Max 3 objets).', ephemeral: true });
        }

        joueur.pieces -= item.price;
        joueur.inventaire = [...joueur.inventaire, item.name];
        
        // Retirer l'objet de la boutique du jour
        if (joueur.boutique_du_jour) {
            joueur.boutique_du_jour = joueur.boutique_du_jour.filter(id => id !== item.id);
        }

        await joueur.save();
        return interaction.reply({ content: `Tu as acheté **${item.name}** ! Il te reste **${joueur.pieces} pièces**.`, ephemeral: true });
    }
}

module.exports = {
    handleLancerDe,
    handleAcheterEtoile,
    handlePasserEtoile,
    handleUtiliserObjet,
    handleUseItem,
    handleDePipeChoix,
    handleBooChoice,
    handleBooTarget,
    handleBuyItem
};
