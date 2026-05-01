const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { Joueur, Plateau } = require('../db/models');
const { getCase } = require('./board');
const { generateBoardImage } = require('../utils/canvas');
const config = require('../config');

const activeInteractionTokens = new Map();

function createTimeout(userId, type, interaction) {
    const token = Date.now().toString() + Math.random().toString();
    activeInteractionTokens.set(userId, token);
    setTimeout(async () => {
        if (activeInteractionTokens.get(userId) === token) {
            activeInteractionTokens.delete(userId);
            try {
                await interaction.editReply({ components: [] }).catch(()=>{});
                const j = await Joueur.findByPk(userId);
                if (!j) return;
                const channel = interaction.client.channels.cache.get(config.boardChannelId);
                if (type === 'etoile' || type === 'boutique') {
                    if (channel) channel.send('⏰ **<@' + userId + '>** a hésité trop longtemps devant la ' + (type === 'etoile' ? 'Étoile' : 'Boutique') + ' ! Son tour passe automatiquement.');
                    if (j.cases_restantes >= 0) {
                        const mockInt = { user: { id: userId, username: 'Joueur' }, client: interaction.client, editReply: async () => {}, followUp: async () => {}, update: async () => {}, deferred: true, replied: true };
                        try { await handleContinuerDeplacement(mockInt, [type]); } catch(e) { console.error(e); }
                    }
                } else if (type === 'boo') {
                    if (channel) channel.send('👻 **<@' + userId + '>** a mis trop de temps à réfléchir... Boo est reparti les mains vides !');
                    if (j.cases_restantes >= 0) {
                        const mockInt = { user: { id: userId, username: 'Joueur' }, client: interaction.client, editReply: async () => {}, followUp: async () => {}, update: async () => {}, deferred: true, replied: true };
                        try { await handleContinuerDeplacement(mockInt, ['boo']); } catch(e) { console.error(e); }
                    }
                } else if (type === 'intersection') {
                    if (channel) channel.send(`⏰ **<@${userId}>** a bêtement foncé tout droit à l'intersection !`);
                    const defaultPath = getCase(j.position).next[0];
    console.log(`[TIMEOUT INTERSECTION] ${userId} sur case ${j.position} -> chemin par défaut ${defaultPath}`);
    j.temp_choix_direction = defaultPath;
                    await j.save();
                    if (j.cases_restantes >= 0) {
                        const mockInt = { user: { id: userId, username: 'Joueur' }, client: interaction.client, editReply: async () => {}, followUp: async () => {}, update: async () => {}, deferred: true, replied: true };
                        try { await handleContinuerDeplacement(mockInt, ['choix_direction']); } catch(e) { console.error(e); }
                    }
                }
                } catch(e) { console.error(e); } finally { const { unlockUser } = require('./transaction'); unlockUser(userId); }
        }
    }, 60000);
}


async function handleLancerDe(interaction) {
    await interaction.deferReply({ flags: 64 });
    const joueur = await Joueur.findByPk(interaction.user.id);
    if (!joueur || !joueur.a_le_droit_de_jouer) {
        return interaction.editReply({ content: 'Tu n\'as pas le droit de jouer.' });
    }

    // Lancer le dé
    let de = 0;
    if (joueur.type_de === 'double') {
        de = Math.floor(Math.random() * 19) + 2; // 2 à 20
        joueur.type_de = 'normal';
    } else if (joueur.type_de === 'triple') {
        de = Math.floor(Math.random() * 28) + 3; // 3 à 30
        joueur.type_de = 'normal';
    } else if (joueur.type_de === 'pipe') {
        de = joueur.de_pipe_valeur;
        joueur.type_de = 'normal';
    } else {
        de = Math.floor(Math.random() * 10) + 1; // 1 à 10
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
    joueur.a_joue_ce_tour = true;
    joueur.jours_inactifs = 0;
    joueur.stat_cases_avancees = (joueur.stat_cases_avancees || 0) + de;
    await joueur.save();

    await processMovement(interaction, joueur, de, false);
}

async function handleContinuerDeplacement(interaction, alreadyHandledOnStart = []) {
    activeInteractionTokens.delete(interaction.user.id);
    if (!interaction.deferred && !interaction.replied) {
        // Enlève les boutons de l'ancien message (Shop, Etoile, /jouer) pour éviter les clics multiples
        await interaction.update({ components: [] }).catch(() => {});
    }
    const joueur = await Joueur.findByPk(interaction.user.id);
    if (!joueur || (joueur.cases_restantes <= 0 && alreadyHandledOnStart.length === 0)) {
        return interaction.editReply({ content: 'Tu n\'as pas de déplacement en cours.' });
    }

    // On bypass le blocage énigme si le joueur a déjà commencé son tour (cases_restantes > 0)
    // pour éviter qu'il ne reste bloqué en plein milieu du terrain le lendemain !
    const plateau = await Plateau.findByPk(1);
    if (plateau && plateau.enigme_status === 'active' && joueur.cases_restantes === 0) {
        return interaction.editReply({ content: 'Le plateau est verrouillé ! Il faut d\'abord résoudre l\'énigme du jour.' }).catch(()=>{});
    }

    const de = joueur.cases_restantes;
    await processMovement(interaction, joueur, de, true, alreadyHandledOnStart);
}

async function processMovement(interaction, joueur, de, isContinuation = false, alreadyHandledOnStart = []) {
    const plateau = await Plateau.findByPk(1);

    if (!isContinuation) {
        joueur.cases_restantes = de;
    }

    let interruption = null;

    while (joueur.cases_restantes > 0) {
        const currentCase = getCase(joueur.position);
        
        if (currentCase.next.length > 1 && !alreadyHandledOnStart.includes('choix_direction')) {
             interruption = { type: 'intersection', case: currentCase };
             break;
        }
        
        let pathChoisi = currentCase.next[0];
        if (currentCase.next.length > 1 && alreadyHandledOnStart.includes('choix_direction')) {
             if (joueur.temp_choix_direction) pathChoisi = Array.isArray(joueur.temp_choix_direction) ? joueur.temp_choix_direction[0] : joueur.temp_choix_direction;
             const idx = alreadyHandledOnStart.indexOf('choix_direction');
             if (idx > -1) alreadyHandledOnStart.splice(idx, 1);
        }
        
        joueur.position = pathChoisi;
        joueur.cases_restantes -= 1;
        
        const c = getCase(joueur.position);
        
        if (c.id === plateau.position_etoile && !alreadyHandledOnStart.includes('etoile')) {     
            interruption = { type: 'etoile', case: c };
            break;
        } else if (c.type === 'Boutique' && !alreadyHandledOnStart.includes('boutique')) {
            interruption = { type: 'boutique', case: c };
            break;
        } else if (c.type === 'Boo' && !alreadyHandledOnStart.includes('boo')) { // Add Boo passthrough support!
            interruption = { type: 'boo', case: c };
            break;
        }
        
        alreadyHandledOnStart = [];
    }

    if (interruption) {
        joueur.position = interruption.case.id;
        await joueur.save();

        let messageAction;
        const cheminStr = joueur.cases_restantes > 0 ? "en chemin " : "";
        
        if (isContinuation) {
            if (de > 0 && de > joueur.cases_restantes) {
                messageAction = `🚶 **<@${interaction.user.id}>** continue et s'arrête ${cheminStr}sur la case **${interruption.case.id} (${interruption.type === 'etoile' ? 'Étoile' : interruption.type === 'boutique' ? 'Boutique' : interruption.type === 'boo' ? 'Boo' : 'Intersection'})** !`;
            } else {
                messageAction = `📍 **<@${interaction.user.id}>** découvre sur sa case actuelle une **${interruption.type === 'etoile' ? 'Étoile' : interruption.type === 'boutique' ? 'Boutique' : interruption.type === 'boo' ? 'Boo' : 'Intersection'}** !`;
            }
        } else {
            messageAction = `🎲 **<@${interaction.user.id}>** a fait un **${de}** et s'arrête ${cheminStr}sur la case **${interruption.case.id} (${interruption.type === 'etoile' ? 'Étoile' : interruption.type === 'boutique' ? 'Boutique' : interruption.type === 'boo' ? 'Boo' : 'Intersection'})** !`;
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
            if (isContinuation) await interaction.followUp({ ...replyContent, flags: 64 }).catch(()=>{});
            else await interaction.editReply(replyContent).catch(()=>{});
            createTimeout(interaction.user.id, 'etoile', interaction);
        } else if (interruption.type === 'boutique') {
            const plateauCur = await Plateau.findByPk(1);
            if (plateauCur && plateauCur.tour >= 30) {
                let shopMsg = joueur.cases_restantes > 0
                    ? "🏪 **Tu passes devant la Boutique, mais elle est fermée pour ce dernier tour !**"
                    : "🏪 **Tu atterris sur la Boutique, mais elle est fermée pour ce dernier tour !**";
                const tempRow = new ActionRowBuilder();
                if (joueur.cases_restantes > 0) {
                    tempRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId('continuer_deplacement')
                            .setLabel(`🚶 Continuer (${joueur.cases_restantes} cases)`)
                            .setStyle(ButtonStyle.Success)
                    );
                } else {
                    tempRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId('voir_plateau')
                            .setLabel('🗺️ Voir le plateau')
                            .setStyle(ButtonStyle.Success)
                    );
                }
                const replyContent = { content: shopMsg, components: [tempRow] };
                if (isContinuation) await interaction.followUp({ ...replyContent, flags: 64 }).catch(()=>{});
                else await interaction.editReply(replyContent).catch(()=>{});
                return;
            }

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
                        .setCustomId(`buy_${item.id}#${index}`)
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
            if (isContinuation) await interaction.followUp({ ...replyContent, flags: 64 }).catch(()=>{});
            else await interaction.editReply(replyContent).catch(()=>{});
            createTimeout(interaction.user.id, 'boutique', interaction);
        } else if (interruption.type === 'intersection') {
            const row = new ActionRowBuilder();
            interruption.case.next.forEach(path => {
                const isBonus = [46, 55].includes(path);
                const nextC = getCase(path);
                let dirLabel = "";
                if (nextC) {
                    const dx = nextC.x - interruption.case.x;
                    const dy = nextC.y - interruption.case.y;
                    if (Math.abs(dx) > Math.abs(dy)) {
                        dirLabel = dx > 0 ? "➡️ Droite" : "⬅️ Gauche";
                    } else {
                        dirLabel = dy > 0 ? "⬇️ Bas" : "⬆️ Haut";
                    }
                }
                const pathDesc = dirLabel ? `${dirLabel} (Case ${path})` : `Case ${path}`;

                if (isBonus) {
                    let hasKey = false;
                    try {
                        const inv = typeof joueur.inventaire === "string" ? JSON.parse(joueur.inventaire) : (joueur.inventaire || []);
                        hasKey = inv.includes("🔑 Clé");
                    } catch (e) {}

                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`choix_direction_${path}`)
                            .setLabel(`🔑 Entrer ${pathDesc}`)
                            .setStyle(ButtonStyle.Success)
                            .setDisabled(!hasKey)
                    );
                } else {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`choix_direction_${path}`)
                            .setLabel(`${pathDesc}`)
                            .setStyle(ButtonStyle.Primary)
                    );
                }
            });
            const replyContent = { content: `🔀 **Intersection !** Quelle direction veux-tu prendre ?`, components: [row] };
            if (isContinuation) await interaction.followUp({ ...replyContent, flags: 64 }).catch(()=>{});
            else await interaction.editReply(replyContent).catch(()=>{});
            createTimeout(interaction.user.id, "intersection", interaction);
        } else if (interruption.type === 'boo') {
            const tempRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('boo_pieces')
                        .setLabel('Voler des pièces (Gratuit)')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('boo_etoile')
                        .setLabel('Voler une Étoile (50 pièces)')
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(joueur.pieces < 50),
                    new ButtonBuilder()
                        .setCustomId('boo_annuler')
                        .setLabel('Passer')
                        .setStyle(ButtonStyle.Secondary)
                );
            const contentText = joueur.cases_restantes > 0
                ? `👻 Boo ! Tu passes devant moi. Voudrais-tu que je vole quelque chose pour toi ?`
                : `👻 Boo ! Tu atterris sur ma case. Voudrais-tu que je vole quelque chose pour toi ?`;
            const replyContent = { content: contentText, components: [tempRow] };
            if (isContinuation) await interaction.followUp({ ...replyContent, flags: 64 }).catch(()=>{});
            else await interaction.editReply(replyContent).catch(()=>{});
            createTimeout(interaction.user.id, 'boo', interaction);
        }
        return;
    }

    // Pas d'interruption, on arrive à la fin
    // Note: nouvellePosition is not used correctly anymore because we moved step-by-step
    joueur.cases_restantes = 0;
    
    // Vérifier les pièges sur la case d'arrivée
    let piegeDeclenche = null;
    let piegesRestants = [...plateau.pieges_actifs];
    
    const piegeIndex = piegesRestants.findIndex(p => p.position === joueur.position);
    if (piegeIndex !== -1) {
        piegeDeclenche = piegesRestants[piegeIndex];
        piegesRestants.splice(piegeIndex, 1);
    }

    if (piegeDeclenche) {
        plateau.pieges_actifs = piegesRestants;
        await plateau.save();
    }

    await joueur.save();

    const caseArrivee = getCase(joueur.position);
    let messageAction;
    let pendingItemToReplace = null;
    if (isContinuation) {
        if (de > 0) {
            messageAction = `🚶 **<@${interaction.user.id}>** avance de **${de} case(s)** et atterrit sur la case **${caseArrivee.id} (${caseArrivee.type})** !`;
        } else {
            messageAction = `📍 **<@${interaction.user.id}>** résout l'effet de sa case **${caseArrivee.id} (${caseArrivee.type})** !`;
        }
    } else {
        messageAction = `🎲 **<@${interaction.user.id}>** a fait un **${de}** et atterrit sur la case **${caseArrivee.id} (${caseArrivee.type})** !`;
    }

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
                let nouvellePositionEtoile;
                do {
                    nouvellePositionEtoile = (() => { const v = require('./board').BOARD_CASES.filter(ca => ca.id <= 45 && ca.type !== 'Boutique' && ca.type !== 'Boo' && ca.id !== 1).map(ca => ca.id); return v[Math.floor(Math.random() * v.length)]; })();
                } while (nouvellePositionEtoile === plateau.position_etoile);
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

    if (caseArrivee.type === 'Boo' && !alreadyHandledOnStart.includes('boo')) {
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
            if (isContinuation) await interaction.followUp({ ...replyContent, flags: 64 }).catch(()=>{});
            else await interaction.editReply(replyContent).catch(()=>{});
            createTimeout(interaction.user.id, 'boo', interaction);
    } else {
        let text = `Tu as atterri sur la case ${caseArrivee.id} ! Regarde le salon <#${config.boardChannelId}> pour voir le résultat.`;
        if (joueur.a_le_droit_de_jouer) {
            text += `\n\n🎯 **Ton déplacement précédent est terminé !** Tu peux maintenant relancer la commande \`/jouer\` pour effectuer ton action d'aujourd'hui !`;
        }
        const replyContent = { content: text };
            if (isContinuation) await interaction.followUp({ ...replyContent, flags: 64 }).catch(()=>{});
            else await interaction.editReply(replyContent).catch(()=>{});
    }
}
async function handleAcheterEtoile(interaction) {
    activeInteractionTokens.delete(interaction.user.id);
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(()=>{});
    const plateau = await Plateau.findByPk(1);
    const joueur = await Joueur.findByPk(interaction.user.id);
    
    if (!joueur || joueur.pieces < 20) {
        return interaction.followUp({ content: 'Tu n\'as pas assez de pièces ou une erreur est survenue.', flags: 64 });
    }

    if (joueur.position !== plateau.position_etoile) {
        return interaction.followUp({ content: 'Trop tard ! Quelqu\'un d\'autre vient d\'acheter cette étoile ou tu ne te trouves plus dessus.', flags: 64 });
    }

    joueur.pieces -= 20;
    joueur.etoiles += 1;
    await joueur.save();

    const oldPosition = plateau.position_etoile;

    do {
        plateau.position_etoile = (() => { const v = require('./board').BOARD_CASES.filter(ca => ca.id <= 45 && ca.type !== 'Boutique' && ca.type !== 'Boo' && ca.id !== 1).map(ca => ca.id); return v[Math.floor(Math.random() * v.length)]; })();
    } while (plateau.position_etoile === oldPosition);
    await plateau.save();

    const successMsg = `⭐ **Bravo !** <@${interaction.user.id}> a acheté une Étoile ! 🌟 L'Étoile s'envole vers la case ${plateau.position_etoile} !`;
    const boardChannel = await interaction.client.channels.fetch(config.boardChannelId).catch(() => null);
    if (boardChannel) {
        await boardChannel.send(successMsg);
    } else {
        await interaction.channel.send(successMsg);
    }

    await interaction.editReply({ content: '⭐ **Bravo !** Tu as acheté une Étoile !', components: [] }).catch(()=>{});
    await handleContinuerDeplacement(interaction, ['etoile']);
}

async function handlePasserEtoile(interaction) {
    activeInteractionTokens.delete(interaction.user.id);
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(()=>{});
    const joueur = await Joueur.findByPk(interaction.user.id);
    if (joueur) {
        await interaction.editReply({ content: "Tu as passé ton tour pour l'Étoile.", components: [] }).catch(() => {});
        await handleContinuerDeplacement(interaction, ['etoile']);
    }
}

async function handleUtiliserObjet(interaction) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 }).catch(()=>{});
    const joueur = await Joueur.findByPk(interaction.user.id);
    if (!joueur || !joueur.inventaire || joueur.inventaire.length === 0) {
        return interaction.editReply({ content: 'Ton inventaire est vide.', flags: 64 });
    }

    const plateau = await Plateau.findByPk(1);
    if (plateau && plateau.enigme_status === 'active') {
        return interaction.editReply({ content: "Le plateau est verrouillé ! Il faut d'abord résoudre l'énigme du jour.", flags: 64 });
    }
    
    // Si c'est pas son tour ou s'il a déjà joué
    const isSaturday = new Date().getDay() === 6;
    if (!joueur.a_le_droit_de_jouer || isSaturday) {
        return interaction.editReply({ content: "Tu ne peux pas utiliser d'objet pour le moment (tu as déjà joué ou c'est bloqué).", flags: 64 });
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

    await interaction.editReply({ 
        content: `**Ton inventaire :**\nTu es sur la case **${joueur.position}**. L'Étoile est sur la case **${plateau.position_etoile}**.\nQuel objet veux-tu utiliser ?`, 
        components: [row], 
        flags: 64 
    }).catch(()=>{});
}

async function handleUseItem(interaction) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(()=>{});
    const parts = interaction.customId.split('_');
    const itemIndexStr = parts.pop(); // extracts the last part (e.g. '0')
    const itemKey = parts.slice(1).join('_'); // recombines the rest (e.g. 'PIEGE_PIECES')
    const itemIndex = parseInt(itemIndexStr);

    const joueur = await Joueur.findByPk(interaction.user.id);
    if (!joueur) return interaction.followUp({ content: 'Erreur avec ton joueur.', flags: 64 });

    await joueur.reload();

    if (!joueur.inventaire || joueur.inventaire.length <= itemIndex) {
        return interaction.followUp({ content: 'Erreur avec ton inventaire.', flags: 64 });
    }

    const { ITEMS } = require('./items');
    const item = ITEMS[itemKey];
    if (!item) return interaction.followUp({ content: 'Objet inconnu.', flags: 64 });

    // Retirer l'objet de l'inventaire
    const newInv = [...joueur.inventaire];
    newInv.splice(itemIndex, 1);
    joueur.inventaire = newInv;
    joueur.stat_objets_utilises = (joueur.stat_objets_utilises || 0) + 1;

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
        joueur.position = (() => { const v = require('./board').BOARD_CASES.filter(ca => ca.id <= 45 && ca.type !== 'Boutique' && ca.type !== 'Boo' && ca.id !== 1).map(ca => ca.id); return v[Math.floor(Math.random() * v.length)]; })();
        message += `Tu as été téléporté sur la case ${joueur.position} !`;
        if (channel) channel.send(`🧪 <@${joueur.discord_id}> a utilisé un Tuyau et atterrit sur la case ${joueur.position} !`);
    } else if (item.id === 'miroir') {
        const tousLesJoueurs = await Joueur.findAll();
        const autresJoueurs = tousLesJoueurs.filter(j => j.discord_id !== joueur.discord_id && !j.est_fantome);
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
            nouvellePositionEtoile = (() => { const v = require('./board').BOARD_CASES.filter(ca => ca.id <= 45 && ca.type !== 'Boutique' && ca.type !== 'Boo' && ca.id !== 1).map(ca => ca.id); return v[Math.floor(Math.random() * v.length)]; })();
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
        const boardDef = require('./board').BOARD_CASES;
        const findDevant = boardDef.find(ca => ca.next.includes(plateau.position_etoile));
        let posDevant = findDevant ? findDevant.id : 1;
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
                { label: '6', value: '6' },
                { label: '7', value: '7' },
                { label: '8', value: '8' },
                { label: '9', value: '9' },
                { label: '10', value: '10' }
            ]);
        const row = new ActionRowBuilder().addComponents(select);
        await joueur.save();
        return interaction.followUp({ content: `Tu as utilisé **Dé pipé** ! Quelle valeur veux-tu ?`, components: [row], flags: 64 });
    } else {
        message += `(Effet non implémenté pour le moment)`;
    }

    await joueur.save();
    await interaction.followUp({ content: message, flags: 64 }).catch(()=>{});
}

async function handleDePipeChoix(interaction) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(()=>{});
    const valeur = parseInt(interaction.values[0]);
    const joueur = await Joueur.findByPk(interaction.user.id);
    joueur.type_de = 'pipe';
    joueur.de_pipe_valeur = valeur;
    await joueur.save();
    await interaction.followUp({ content: `Ton prochain lancer fera exactement ${valeur} !`, flags: 64 }).catch(()=>{});
}

async function handleBooChoice(interaction) {
    activeInteractionTokens.delete(interaction.user.id);
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(()=>{});
    const type = interaction.customId.split('_')[1]; // 'pieces' ou 'etoile' ou 'annuler'
    
    const channel = interaction.client.channels.cache.get(require('../config').boardChannelId);
    if (type === 'annuler') {
        if (channel) await channel.send(`👻 <@${interaction.user.id}> a ignoré l'invitation de Boo... le fantôme s'en va, déçu.`);
        return interaction.followUp({ content: 'Interaction expiré, Boo s\'en est allé.', components: [], flags: 64 });
    }

    const joueur = await Joueur.findByPk(interaction.user.id);
    
    if (type === 'etoile' && joueur.pieces < 50) {
        return interaction.followUp({ content: 'Tu n\'as pas assez de pièces pour voler une étoile.', flags: 64 });
    }

    const tousLesJoueurs = await Joueur.findAll();
    const ciblesPotentielles = tousLesJoueurs.filter(j => j.discord_id !== joueur.discord_id && (type === 'pieces' ? j.pieces > 0 : j.etoiles > 0) && !j.est_fantome);

    if (ciblesPotentielles.length === 0) {
        return interaction.followUp({ content: `Personne n'a de ${type} à voler !`, flags: 64 });
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
    await interaction.followUp({ content: `Qui veux-tu voler ?`, components: [row], flags: 64 }).catch(()=>{});
}

async function handleBooTarget(interaction) {
    activeInteractionTokens.delete(interaction.user.id);
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(()=>{});
    const type = interaction.customId.split('_')[2]; // 'pieces' ou 'etoile'
    const cibleId = interaction.values[0];
    
    const joueur = await Joueur.findByPk(interaction.user.id);
    const cible = await Joueur.findByPk(cibleId);

    if (!cible) return interaction.followUp({ content: 'Cible introuvable.', flags: 64 });

    let messageAction = '';
    if (type === 'pieces') {
        const montantVole = Math.floor(Math.random() * 10) + 3; // 3 à 12
        const volReel = Math.min(montantVole, Math.max(0, cible.pieces));
        cible.pieces -= volReel;
        joueur.pieces += volReel;
        messageAction = `👻 **Boo !** <@${joueur.discord_id}> a volé ${volReel} pièces à <@${cible.discord_id}> ! *(${interaction.user.username}: ${joueur.pieces} 🪙 | <@${cible.discord_id}>: ${cible.pieces} 🪙)*`;
    } else if (type === 'etoile') {
        if (joueur.pieces < 50) return interaction.followUp({ content: 'Tu n\'as plus assez de pièces.', flags: 64 });
        if (cible.etoiles < 1) return interaction.followUp({ content: 'La cible n\'a plus d\'étoile.', flags: 64 });
        
        joueur.pieces -= 50;
        cible.etoiles -= 1;
        joueur.etoiles += 1;
        messageAction = `👻 **Boo !** <@${joueur.discord_id}> a payé 50 pièces pour voler une Étoile à <@${cible.discord_id}> ! *(${interaction.user.username}: ${joueur.etoiles} ⭐ | <@${cible.discord_id}>: ${cible.etoiles} ⭐)*`;
    }

    await joueur.save();
    await cible.save();

    await interaction.editReply({ content: 'Vol effectué !', components: [] }).catch(()=>{});
    
    const channel = interaction.client.channels.cache.get(config.boardChannelId);
    if (channel) {
        await channel.send(messageAction);
    }
}

async function handleBuyItem(interaction) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(()=>{});
    const joueur = await Joueur.findByPk(interaction.user.id);
    let itemId = interaction.customId.replace('buy_', '').split('#')[0];

    if (!joueur) return interaction.followUp({ content: 'Erreur joueur.', flags: 64 });

    await joueur.reload();

    const { ITEMS } = require('./items');
    const itemKey = Object.keys(ITEMS).find(k => ITEMS[k].id === itemId);
    const item = ITEMS[itemKey];

    if (!item) return interaction.followUp({ content: 'Objet inconnu.', flags: 64 });

    if (joueur.pieces < item.price) {
        return interaction.followUp({ content: 'Tu n\'as pas assez de pièces.', flags: 64 });
    }

    if (item.isPack) {
        if (joueur.inventaire.length + item.contents.length > 3) {
            return interaction.followUp({ content: `Ton inventaire est trop plein pour ce pack (il te faut ${item.contents.length} places libres).`, flags: 64 });
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
        await interaction.editReply({ content: `🛒 Tu as acheté **${item.name}** !` + (joueur.cases_restantes <= 0 ? ` Il te reste **${joueur.pieces} pièces**.` : ''), components: [] }).catch(()=>{});
        activeInteractionTokens.delete(interaction.user.id);
        await handleContinuerDeplacement(interaction, ['boutique']);
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

            return interaction.editReply({ 
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
        await interaction.editReply({ content: `🛒 Tu as acheté **${item.name}** !` + (joueur.cases_restantes <= 0 ? ` Il te reste **${joueur.pieces} pièces**.` : ''), components: [] }).catch(()=>{});
        activeInteractionTokens.delete(interaction.user.id);
        await handleContinuerDeplacement(interaction, ['boutique']);
    }
}

async function handleBuyCancel(interaction) {
    activeInteractionTokens.delete(interaction.user.id);
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(()=>{});
    const joueur = await Joueur.findByPk(interaction.user.id);
    if (joueur) {
        await interaction.editReply({ content: 'Tu as quitté la boutique' + (joueur.cases_restantes > 0 ? ', en route !' : '.'), components: [] }).catch(()=>{});
        activeInteractionTokens.delete(interaction.user.id);
        await handleContinuerDeplacement(interaction, ['boutique']);
    }
}


async function handleReplaceBuy(interaction) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(()=>{});
    const itemId = interaction.customId.replace('replace_buy_', '');
    const indexToDrop = parseInt(interaction.values[0]);
    const joueur = await Joueur.findByPk(interaction.user.id);
    
    if (!joueur) return interaction.followUp({ content: 'Erreur', flags: 64 });

    await joueur.reload();

    const { ITEMS } = require('./items');
    const itemKey = Object.keys(ITEMS).find(k => ITEMS[k].id === itemId);
    const item = ITEMS[itemKey];

    if (!item) return interaction.followUp({ content: 'Objet inconnu.', flags: 64 });

    if (joueur.pieces < item.price) {
        return interaction.editReply({ content: 'Tu n\'as plus assez de pièces.', components: [] }).catch(()=>{});
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

    await interaction.editReply({ content: `🛒 Tu as jeté **${droppedItem}** et acheté **${item.name}** !` + (joueur.cases_restantes <= 0 ? ` Il te reste **${joueur.pieces} pièces**.` : ''), components: [] }).catch(()=>{});
    activeInteractionTokens.delete(interaction.user.id);
        await handleContinuerDeplacement(interaction, ['boutique']);
}

async function handleReplaceChance(interaction) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(()=>{});
    const itemId = interaction.customId.replace('replace_chance_', '');
    const indexToDrop = parseInt(interaction.values[0]);
    const joueur = await Joueur.findByPk(interaction.user.id);
    
    if (!joueur) return interaction.followUp({ content: 'Erreur', flags: 64 });

    const { ITEMS } = require('./items');
    const itemKey = Object.keys(ITEMS).find(k => ITEMS[k].id === itemId);
    const item = ITEMS[itemKey];

    if (!item) return interaction.followUp({ content: 'Objet inconnu.', flags: 64 });

    const droppedItem = joueur.inventaire[indexToDrop];
    
    const newInv = [...joueur.inventaire];
    newInv[indexToDrop] = item.name;
    joueur.inventaire = newInv;

    await joueur.save();
    
    await interaction.editReply({ content: `🗑️ Tu as jeté **${droppedItem}** et gardé **${item.name}** !`, components: [] }).catch(()=>{});
}

async function handleUnblockFantome(interaction) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(()=>{});
    const joueur = await Joueur.findByPk(interaction.user.id);
    if (!joueur) return interaction.followUp({ content: 'Erreur', flags: 64 });

    if (joueur.est_fantome && !joueur.fantome_unblock_used) {
        joueur.est_fantome = false;
        joueur.fantome_unblock_used = true;
        await joueur.save();
        await interaction.editReply({ content: `🔓 Tu as utilisé ton déblocage unique pour cette partie de 30 tours ! Tu n'es plus en mode fantôme. Utilise à nouveau /jouer pour jouer.`, components: [] }).catch(()=>{});
    } else {
         await interaction.editReply({ content: "Tu ne peux pas te débloquer.", components: [] }).catch(()=>{});
    }
}

async function handleDirectionChoice(interaction) {
    activeInteractionTokens.delete(interaction.user.id);
    await interaction.deferUpdate().catch(err => {
    console.error(`[INTERACTION FAIL] deferUpdate échoué pour ${interaction.user.id} (${interaction.customId}):`, err);
  });
    const { Joueur } = require('../db/models');
    const joueur = await Joueur.findOne({ where: { discord_id: interaction.user.id } });
    if (!joueur) {
        return interaction.followUp({ content: '❌ Joueur introuvable.', flags: 64 });
    }
    const pathChoisi = parseInt(interaction.customId.split('_').pop(), 10);

    if (pathChoisi === 46 || pathChoisi === 55) {
        const inv = [...(joueur.inventaire || [])];
        const keyIndex = inv.indexOf('🔑 Clé');
        if (keyIndex > -1) {
            inv.splice(keyIndex, 1);
            joueur.inventaire = inv;
        } else {
            return interaction.followUp({ content: '❌ Tu n\'as pas la clé pour entrer dans cette zone !', flags: 64 });
        }
    }

    joueur.temp_choix_direction = pathChoisi;
  console.log(`[CHOIX DIRECTION] ${joueur.discord_id} choisit le chemin ${pathChoisi} depuis la case ${joueur.position}`);
    await joueur.save();

    if (global.timeouts && global.timeouts[interaction.user.id]) {
        clearTimeout(global.timeouts[interaction.user.id]);
        delete global.timeouts[interaction.user.id];
    }

    await processMovement(interaction, joueur, 0, true, ['choix_direction']);
}

module.exports = {
    handleDirectionChoice,
    handleUnblockFantome,
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
    handleReplaceChance,
    activeInteractionTokens
};
