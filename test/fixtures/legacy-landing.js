// Frozen excerpt from main a7405cac0fc53dc1ff7764be51d4fda92eccca9c,
// src/gamemodes/mario_party/events.js lines 472-840 (landing effects of processMovement).
// The body below is copied verbatim; only its dependencies are injected.
// Do not update this oracle to match a new implementation.
exports.landing = async function ({ joueur, plateau, caseArrivee, piegeDeclenche, interaction, Joueur, getRandomStarPosition, ITEMS, random }) {
  const Math = Object.assign(Object.create(globalThis.Math), { random });
  const require = () => ({ ITEMS });
  let messageAction = '';
    if (plateau.blocs_caches) {
        let bc = { ...plateau.blocs_caches };
        let foundHiddenBlock = null;
        if (bc.etoile === joueur.position) {
            foundHiddenBlock = "etoile";
            bc.etoile = -1;
        } else if (bc.pieces_20 === joueur.position) {
            foundHiddenBlock = "pieces_20";
            bc.pieces_20 = -1;
        } else if (bc.pieces_10 === joueur.position) {
            foundHiddenBlock = "pieces_10";
            bc.pieces_10 = -1;
        } else if (bc.pieces_5 === joueur.position) {
            foundHiddenBlock = "pieces_5";
            bc.pieces_5 = -1;
        }
        
        if (foundHiddenBlock) {
            plateau.blocs_caches = bc;
            await plateau.save();
            
            if (foundHiddenBlock === 'etoile') {
                joueur.etoiles += 1;
                messageAction += `\n\n🤫✨ **INCROYABLE !** <@${interaction.user.id}> a découvert un **BLOC CACHÉ** sur cette case et obtient une **ÉTOILE** (+1 🌟) !`;
            } else if (foundHiddenBlock === 'pieces_20') {
                joueur.pieces += 20;
                messageAction += `\n\n🤫💰 **GÉNIAL !** <@${interaction.user.id}> a découvert un **BLOC CACHÉ** riche en joyaux sur cette case et obtient **20 PIÈCES** (+20 🪙) !`;
            } else if (foundHiddenBlock === 'pieces_10') {
                joueur.pieces += 10;
                messageAction += `\n\n🤫🪙 **SUPER !** <@${interaction.user.id}> a découvert un **BLOC CACHÉ** sur cette case et y trouve **10 PIÈCES** (+10 🪙) !`;
            } else if (foundHiddenBlock === 'pieces_5') {
                joueur.pieces += 5;
                messageAction += `\n\n🤫🪙 **CHANCEUX !** <@${interaction.user.id}> a découvert un petit **BLOC CACHÉ** sur cette case et obtient **5 PIÈCES** (+5 🪙) !`;
            }
        }
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

    // Multiplicateur fin de partie (tours 26 à 30 = x2)
    const isLastTurns = plateau && plateau.tour >= 26;
    const gainPiece = isLastTurns ? 6 : 3;

    if (caseArrivee.type === 'Bleue') {
            joueur.pieces += gainPiece;
            joueur.stat_cases_chance = (joueur.stat_cases_chance || 0) + 1;
            messageAction += `\n**${interaction.user.username}** gagne ${gainPiece} pièces ! 💰 *(Total: ${joueur.pieces} 🪙)*`;
        } else if (caseArrivee.type === 'Rouge') {
            joueur.pieces = Math.max(0, joueur.pieces - gainPiece);
            joueur.stat_cases_malchance = (joueur.stat_cases_malchance || 0) + 1;
            messageAction += `\n**${interaction.user.username}** perd ${gainPiece} pièces ! 💸 *(Reste: ${joueur.pieces} 🪙)*`;
        } else if (caseArrivee.type === 'Chance') {
            joueur.stat_cases_chance = (joueur.stat_cases_chance || 0) + 1;
            const gains = [
                { type: 'pieces', val: 5, msg: '+5 pièces' },
                { type: 'pieces', val: 10, msg: '+10 pièces' },
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
                const autresJoueurs = tousLesJoueurs.filter(j => j.discord_id !== joueur.discord_id && j.pieces > 0 && !j.est_fantome);
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
            joueur.stat_cases_malchance = (joueur.stat_cases_malchance || 0) + 1;
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
                joueur.stat_cases_malchance = (joueur.stat_cases_malchance || 0) + 1;
                messageAction += `\n🌩️ **Malchance !** Bowser apparaît devant **${interaction.user.username}** et lance sa roulette infernale !`;

                // --- Roulette Bowser ---
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
                const autresJoueurs = tousLesJoueurs.filter(j => j.discord_id !== joueur.discord_id && !j.est_fantome);
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
                const nouvellePositionEtoile = await getRandomStarPosition(plateau.position_etoile);
                plateau.position_etoile = nouvellePositionEtoile;
                await plateau.save();
                messageAction += `\n🎭 **Coup du Sort !** Étoile Filante : L'Étoile se déplace sur la case ${nouvellePositionEtoile} !`;
            } else if (evt.type === 'roulette_vol') {
                const tousLesJoueurs = await Joueur.findAll();
                const autresJoueurs = tousLesJoueurs.filter(j => j.discord_id !== joueur.discord_id && !j.est_fantome);
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
                const autresJoueurs = tousLesJoueurs.filter(j => j.discord_id !== joueur.discord_id && !j.est_fantome);
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
                const autresJoueurs = tousLesJoueurs.filter(j => j.discord_id !== joueur.discord_id && !j.est_fantome);
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
                const autresJoueurs = tousLesJoueurs.filter(j => j.discord_id !== joueur.discord_id && !j.est_fantome);
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
                const autresJoueurs = tousLesJoueurs.filter(j => j.discord_id !== joueur.discord_id && !j.est_fantome);
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
            joueur.stat_cases_malchance = (joueur.stat_cases_malchance || 0) + 1;
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

    await joueur.save();
  return messageAction;
};
