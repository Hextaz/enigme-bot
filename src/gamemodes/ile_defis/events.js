const { Joueur, Plateau, TourSnapshot } = require('../../db/models');
const { getCase, BOARD_CASES } = require('./maps/board_game_island/board');
const config = require('../../config');
const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { lockUser, unlockUser } = require('../../game/transaction');

const activeInteractionTokens = new Map();

// Utilitaire pour invalider le cache du Canvas de plateau
function clearBoardCache() {
    try {
        const canvasUtils = require('../../utils/canvas');
        if (typeof canvasUtils.invalidateBoardCache === 'function') {
            canvasUtils.invalidateBoardCache();
        }
    } catch(e) {
        console.error("[CACHE] Impossible d'invalider le cache Canvas :", e);
    }
}

// Timeout de 60 secondes pour les obstacles
function createTimeout(userId, type, interaction) {
    const token = Date.now().toString() + Math.random().toString();
    activeInteractionTokens.set(userId, token);
    setTimeout(async () => {
        if (activeInteractionTokens.get(userId) === token) {
            activeInteractionTokens.delete(userId);
            try {
                // Enlever les boutons de l'interaction expirée
                await interaction.editReply({ components: [] }).catch(()=>{});
                
                const joueur = await Joueur.findByPk(userId);
                if (!joueur) return;
                
                const channel = interaction.client.channels.cache.get(config.boardChannelId);
                const mockInt = { 
                    user: { id: userId, username: interaction.user.username }, 
                    client: interaction.client, 
                    editReply: async () => {}, 
                    followUp: async () => {}, 
                    update: async () => {}, 
                    deferred: true, 
                    replied: true 
                };

                if (type === 'portail' || type === 'cascade') {
                    if (channel) {
                        channel.send(`⏰ **<@${userId}>** a tremblé devant l'obstacle et a échoué automatiquement par manque de temps !`);
                    }
                    // Résolution automatique par échec
                    joueur.cases_restantes = 0;
                    await joueur.save();
                    clearBoardCache();
                } else if (type === 'liane') {
                    if (channel) {
                        channel.send(`⏰ **<@${userId}>** a trop tardé à s'élancer sur la liane. Le bot l'a poussé !`);
                    }
                    // Résolution automatique : saut liane standard de 1d6
                    const saut = Math.floor(Math.random() * 6) + 1;
                    if (channel) {
                        channel.send(`🦧✨ **SAUT LIANE TIMEOUT !** **<@${userId}>** s'élance automatiquement et avance de **+${saut} cases** !`);
                    }
                    joueur.cases_restantes = saut;
                    await joueur.save();
                    await handleContinuerDeplacement(mockInt, ['liane']);
                } else if (type === 'intersection') {
                    if (channel) {
                        channel.send(`⏰ **<@${userId}>** a hésité trop longtemps... Il a foncé tout droit par défaut !`);
                    }
                    // Prendre le premier chemin (la route longue/sûre)
                    const currentCase = getCase(joueur.position);
                    const defaultPath = currentCase.next[0];
                    joueur.temp_choix_direction = defaultPath;
                    await joueur.save();
                    await handleContinuerDeplacement(mockInt, ['choix_direction']);
                }
            } catch(e) { 
                console.error(e); 
            } finally { 
                unlockUser(userId); 
            }
        }
    }, 60000);
}

// Snapshot de sécurité out-of-the-box pour /admin annuler_tour
async function createTourSnapshot(joueur, plateau, tousLesJoueurs) {
    const autresJoueurs = tousLesJoueurs
        .filter(j => j.discord_id !== joueur.discord_id)
        .map(j => ({
            discord_id: j.discord_id,
            pieces: j.pieces,
            etoiles: j.etoiles,
            inventaire: j.inventaire,
            position: j.position
        }));

    await TourSnapshot.create({
        discord_id: joueur.discord_id,
        tour: plateau.tour,
        position: joueur.position,
        pieces: joueur.pieces,
        etoiles: joueur.etoiles,
        inventaire: joueur.inventaire,
        a_le_droit_de_jouer: joueur.a_le_droit_de_jouer,
        a_joue_ce_tour: joueur.a_joue_ce_tour,
        cases_restantes: joueur.cases_restantes,
        jours_inactifs: joueur.jours_inactifs,
        est_fantome: joueur.est_fantome,
        fantome_unblock_used: joueur.fantome_unblock_used,
        bonus_prochain_lancer: joueur.bonus_prochain_lancer,
        de_limite: joueur.de_limite,
        type_de: joueur.type_de,
        de_pipe_valeur: joueur.de_pipe_valeur,
        plateau_position_etoile: plateau.position_etoile,
        plateau_pieges_actifs: plateau.pieges_actifs,
        plateau_blocs_caches: plateau.blocs_caches,
        autres_joueurs_snapshot: autresJoueurs
    });
}

// Handler de Lancer de Dé
async function handleLancerDe(interaction) {
    const userId = interaction.user.id;
    try {
        await interaction.deferReply({ flags: 64 });
        
        if (!lockUser(userId)) {
            return interaction.editReply({ content: "❌ Une action est déjà en cours. Attends que ton tour précédent soit fini !" });
        }

        const joueur = await Joueur.findByPk(userId);
        if (!joueur || !joueur.a_le_droit_de_jouer) {
            unlockUser(userId);
            return interaction.editReply({ content: "Tu n'as pas le droit de jouer." });
        }

        const plateau = await Plateau.findByPk(1);
        const tousLesJoueurs = await Joueur.findAll();
        
        // Snapshot avant le tour
        await createTourSnapshot(joueur, plateau, tousLesJoueurs);

        // Jets de dés
        const deStandard = Math.floor(Math.random() * 6) + 1; // 1d6 standard
        let deBonus = 0;
        
        let mData = joueur.mode_data || {};
        const bonusDe = mData.bonus_de || 'none';
        
        if (bonusDe === 'gold') {
            deBonus = Math.floor(Math.random() * 8) + 1; // Or: 1 à 8
        } else if (bonusDe === 'silver') {
            deBonus = Math.floor(Math.random() * 3) + 1; // Argent: 1 à 3
        } else if (bonusDe === 'bronze' || bonusDe === 'chocolat') {
            deBonus = Math.floor(Math.random() * 2) + 1; // Bronze/Chocolat: 1 à 2
        }

        const totalRoll = deStandard + deBonus;
        
        // Règle des doubles
        let doubleObtenu = false;
        if (deBonus > 0 && deStandard === deBonus) {
            doubleObtenu = true;
            mData.double_lancer = true;
        }
        
        // Reset du dé bonus après utilisation
        mData.bonus_de = 'none';
        joueur.mode_data = mData;

        // Stat avancées
        joueur.stat_cases_avancees = (joueur.stat_cases_avancees || 0) + totalRoll;
        joueur.a_le_droit_de_jouer = doubleObtenu; // Si double, il garde le droit de jouer pour son second lancer gratuit !
        joueur.a_joue_ce_tour = true;
        joueur.jours_inactifs = 0;
        
        await joueur.save();

        let extraText = `🎲 Tu lances ton dé standard et obtiens **${deStandard}** !`;
        if (deBonus > 0) {
            extraText += `\n✨ Ton dé bonus (**${bonusDe.toUpperCase()}**) s'ajoute et fait **${deBonus}** ! (Total : **${totalRoll}** cases)`;
        }
        if (doubleObtenu) {
            extraText += `\n🎉 **DOUBLE !** Tu obtiendras un lancer de dé standard gratuit supplémentaire immédiatement après la fin de ce déplacement !`;
        }

        await interaction.editReply({ content: extraText });

        await processMovement(interaction, joueur, totalRoll, false);

    } catch (err) {
        console.error(`[ERREUR] handleLancerDe pour ${userId}:`, err);
        unlockUser(userId);
        try {
            await interaction.followUp({ content: "❌ Une erreur est survenue lors du lancer de dé.", flags: 64 });
        } catch(e){}
    }
}

// Continuer le déplacement (interrompu par Portail, Liane, Cascade ou Intersection)
async function handleContinuerDeplacement(interaction, alreadyHandledOnStart = []) {
    const userId = interaction.user.id;
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.update({ components: [] }).catch(()=>{});
        }
        
        if (!lockUser(userId)) {
            return; // Déjà verrouillé
        }

        const joueur = await Joueur.findByPk(userId);
        if (!joueur || joueur.cases_restantes <= 0) {
            unlockUser(userId);
            return;
        }

        const steps = joueur.cases_restantes;
        await processMovement(interaction, joueur, steps, true, alreadyHandledOnStart);
    } catch (err) {
        console.error(`[ERREUR] handleContinuerDeplacement pour ${userId}:`, err);
        unlockUser(userId);
    }
}

// Algorithme principal de déplacement case par case
async function processMovement(interaction, joueur, steps, isContinuation = false, alreadyHandledOnStart = []) {
    const plateau = await Plateau.findByPk(1);
    const userId = joueur.discord_id;
    
    if (!isContinuation) {
        joueur.cases_restantes = steps;
    }

    let pData = plateau.mode_data || {};
    pData.portails_ouverts = pData.portails_ouverts || [];
    pData.cascade_desactivee = pData.cascade_desactivee || false;

    let interruption = null;

    while (joueur.cases_restantes > 0) {
        const currentCase = getCase(joueur.position);

        // 1. Gérer les intersections
        if (currentCase.type === 'Intersection' && !alreadyHandledOnStart.includes('choix_direction')) {
            interruption = { type: 'intersection', case: currentCase };
            break;
        }

        let nextCaseId = currentCase.next[0];
        if (currentCase.type === 'Intersection' && alreadyHandledOnStart.includes('choix_direction')) {
            nextCaseId = joueur.temp_choix_direction;
            const idx = alreadyHandledOnStart.indexOf('choix_direction');
            if (idx > -1) alreadyHandledOnStart.splice(idx, 1);
        }

        // 2. Gérer le Portail bloquant devant
        const nextCaseObj = getCase(nextCaseId);
        if (nextCaseObj && nextCaseObj.type === 'Portail' && !pData.portails_ouverts.includes(nextCaseId) && !alreadyHandledOnStart.includes('portail')) {
            interruption = { type: 'portail', case: currentCase, targetGateId: nextCaseId };
            break;
        }

        // Si le portail est franchi ou déjà ouvert
        if (nextCaseObj && nextCaseObj.type === 'Portail') {
            const idx = alreadyHandledOnStart.indexOf('portail');
            if (idx > -1) alreadyHandledOnStart.splice(idx, 1);
        }

        // Déplacer le joueur sur la case suivante
        joueur.position = nextCaseId;
        joueur.cases_restantes -= 1;

        const c = getCase(joueur.position);

        // 3. Gérer l'arrêt sur une Liane
        if (c.type === 'Liane' && !alreadyHandledOnStart.includes('liane')) {
            interruption = { type: 'liane', case: c };
            break;
        } else if (c.type === 'Liane') {
            const idx = alreadyHandledOnStart.indexOf('liane');
            if (idx > -1) alreadyHandledOnStart.splice(idx, 1);
        }

        // 4. Gérer l'arrêt sur la Cascade
        if (c.type === 'Cascade' && !pData.cascade_desactivee && !alreadyHandledOnStart.includes('cascade')) {
            interruption = { type: 'cascade', case: c };
            break;
        } else if (c.type === 'Cascade') {
            const idx = alreadyHandledOnStart.indexOf('cascade');
            if (idx > -1) alreadyHandledOnStart.splice(idx, 1);
        }

        // 5. Gérer l'arrêt net sur le Dragon de fin (Case 73)
        if (c.type === 'Dragon' && !alreadyHandledOnStart.includes('dragon')) {
            joueur.cases_restantes = 0; // Surplus ignoré
            interruption = { type: 'dragon', case: c };
            break;
        }

        alreadyHandledOnStart = [];
    }

    await joueur.save();
    clearBoardCache();

    const channel = interaction.client.channels.cache.get(config.boardChannelId);

    // CAS D'INTERRUPTION
    if (interruption) {
        // Envoi de l'image de la zone actuelle sur le channel public
        if (channel) {
            const destZone = getCase(joueur.position).zone;
            const textPublic = `🎲 **<@${userId}>** s'arrête en chemin sur la case **${joueur.position} (${interruption.type.toUpperCase()})** !`;
            
            let tousLesJoueurs = await Joueur.findAll();
            tousLesJoueurs = tousLesJoueurs.sort((a, b) => a.discord_id === userId ? 1 : b.discord_id === userId ? -1 : 0);
            
            // Forcer le Canvas à dessiner cette zone
            const { generateBoardImage } = require('../../utils/canvas');
            const buffer = await generateBoardImage(tousLesJoueurs, plateau, interaction.client, destZone);
            const attachment = new AttachmentBuilder(buffer, { name: 'board.png' });
            await channel.send({ content: textPublic, files: [attachment] });
        }

        // Proposer les boutons d'interaction au joueur (privé/éphémère)
        let row = new ActionRowBuilder();
        let contentText = "";

        if (interruption.type === 'portail') {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('acheter_etoile') // Mappé sur handleAcheterEtoile
                    .setLabel('🚪 Tenter d\'ouvrir le Portail (Jet 4+)')
                    .setStyle(ButtonStyle.Primary)
            );
            contentText = `🚪 **Tu es devant le Portail !** Pour le franchir et l'ouvrir pour tout le serveur, tu dois faire **4 ou plus** sur ton jet de dé standard.`;
            
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: contentText, components: [row], flags: 64 }).catch(()=>{});
            } else {
                await interaction.editReply({ content: contentText, components: [row] }).catch(()=>{});
            }
            createTimeout(userId, 'portail', interaction);
            unlockUser(userId);

        } else if (interruption.type === 'cascade') {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('acheter_etoile') // Mappé sur handleAcheterEtoile
                    .setLabel('🌊 Tenter la traversée (Jet 3+)')
                    .setStyle(ButtonStyle.Primary)
            );
            contentText = `🌊 **Tu es sur le Pont de la Cascade !** Pour franchir ce piège et le désactiver définitivement pour tous, tu dois faire **3 ou plus**. Si tu échoues, tu tombes à l'eau !`;
            
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: contentText, components: [row], flags: 64 }).catch(()=>{});
            } else {
                await interaction.editReply({ content: contentText, components: [row] }).catch(()=>{});
            }
            createTimeout(userId, 'cascade', interaction);
            unlockUser(userId);

        } else if (interruption.type === 'liane') {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('passer_etoile') // Mappé sur handlePasserEtoile
                    .setLabel('🦧 S\'élancer sur la liane')
                    .setStyle(ButtonStyle.Success)
            );
            contentText = `🦧 **Tu es sur une case Saut Liane !** Clique sur le bouton pour s'élancer et obtenir un bonus de déplacement (1d6) sans aucun risque !`;
            
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: contentText, components: [row], flags: 64 }).catch(()=>{});
            } else {
                await interaction.editReply({ content: contentText, components: [row] }).catch(()=>{});
            }
            createTimeout(userId, 'liane', interaction);
            unlockUser(userId);

        } else if (interruption.type === 'intersection') {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('choix_direction_left')
                    .setLabel('👈 Chemin de Gauche')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('choix_direction_right')
                    .setLabel('👉 Chemin de Droite')
                    .setStyle(ButtonStyle.Secondary)
            );
            contentText = `🛤️ **Intersection !** Choisis ton chemin. Fais bien attention, l'un des deux côtés comporte une chute d'eau aléatoire qui termine immédiatement ton tour !`;
            
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: contentText, components: [row], flags: 64 }).catch(()=>{});
            } else {
                await interaction.editReply({ content: contentText, components: [row] }).catch(()=>{});
            }
            createTimeout(userId, 'intersection', interaction);
            unlockUser(userId);

        } else if (interruption.type === 'dragon') {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('acheter_etoile') // Mappé sur handleAcheterEtoile
                    .setLabel('🗡️ Affronter le Dragon ! (Jet 6+)')
                    .setStyle(ButtonStyle.Danger)
            );
            contentText = `🏆 **TU ES DEVANT LE DRAGON !** C'est le combat final ! Lance tes dés : si ton score cumulé est de **6 ou plus**, tu terrasses le Dragon !`;
            
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: contentText, components: [row], flags: 64 }).catch(()=>{});
            } else {
                await interaction.editReply({ content: contentText, components: [row] }).catch(()=>{});
            }
            unlockUser(userId);
        }

        return;
    }

    // RESOLUTION FINALE DU MOUVEMENT NORMAL (Atterrissage sans interruption)
    const finalCase = getCase(joueur.position);
    let finalMessageText = `🏁 **<@${userId}>** termine son déplacement sur la case **${joueur.position} (${finalCase.name})** !`;

    // Vérifier les effets de cases spéciales à l'atterrissage
    if (finalCase.type === 'Elan') {
        const bonus = Math.random() > 0.5 ? 3 : 2;
        joueur.position += bonus;
        await joueur.save();
        finalMessageText += `\n🏃 **SUPER ÉLAN !** Il bondit immédiatement de **+${bonus} cases** et s'arrête sur la case **${joueur.position}** !`;
        if (channel) {
            channel.send(`🏃 **ÉLAN !** **<@${userId}>** atterrit sur la case ${finalCase.id} et bondit de +${bonus} cases jusqu'à la case **${joueur.position}** !`);
        }
    } else if (finalCase.type === 'Glissade') {
        const malus = Math.random() > 0.5 ? 3 : 2;
        joueur.position = Math.max(1, joueur.position - malus);
        await joueur.save();
        finalMessageText += `\n📉 **GLISSADE !** Il glisse et recule de **-${malus} cases** jusqu'à la case **${joueur.position}** !`;
        if (channel) {
            channel.send(`📉 **GLISSADE !** **<@${userId}>** glisse de la case ${finalCase.id} et recule jusqu'à la case **${joueur.position}** !`);
        }
    } else if (finalCase.type === 'Rocher') {
        const activeZone = finalCase.zone;
        const tousLesJoueurs = await Joueur.findAll();
        let impactes = [];
        
        for (const j of tousLesJoueurs) {
            const jCase = getCase(j.position);
            if (jCase && jCase.zone === activeZone) {
                j.position = Math.max(1, j.position - 5);
                await j.save();
                impactes.push(`<@${j.discord_id}>`);
            }
        }
        
        finalMessageText += `\n🪨💥 **ALERTE ROCHER !** Un rocher dévale la pente ! Tous les joueurs de la zone **${activeZone.toUpperCase()}** reculent de 5 cases !`;
        if (channel) {
            channel.send(`🪨💥 **ÉBOULEMENT !** **<@${userId}>** a déclenché le Rocher Géant à la case ${finalCase.id} ! Tous les joueurs de la zone **${activeZone.toUpperCase()}** (${impactes.join(', ')}) reculent de 5 cases !`);
        }
    } else if (finalCase.type === 'Echange') {
        const roll = Math.floor(Math.random() * 6) + 1; // 1d6 automatique
        const tousLesJoueurs = await Joueur.findAll();
        
        let target = null;
        let desc = "";

        if (roll === 1 || roll === 2) {
            // Joueur juste devant lui
            const devant = tousLesJoueurs
                .filter(j => j.position > joueur.position)
                .sort((a, b) => a.position - b.position)[0];
            if (devant) {
                target = devant;
                desc = "le joueur juste devant";
            }
        } else if (roll === 3 || roll === 4) {
            // Joueur juste derrière lui
            const derriere = tousLesJoueurs
                .filter(j => j.position < joueur.position)
                .sort((a, b) => b.position - a.position)[0];
            if (derriere) {
                target = derriere;
                desc = "le joueur juste derrière";
            }
        } else if (roll === 5) {
            // Le premier de la course
            const leader = tousLesJoueurs
                .sort((a, b) => b.position - a.position)[0];
            if (leader && leader.discord_id !== joueur.discord_id) {
                target = leader;
                desc = "le premier de la course (LE BRAQUAGE !)";
            }
        } else if (roll === 6) {
            // Le dernier de la course
            const looser = tousLesJoueurs
                .sort((a, b) => a.position - b.position)[0];
            if (looser && looser.discord_id !== joueur.discord_id) {
                target = looser;
                desc = "le dernier de la course (LA LOOSE...)";
            }
        }

        if (target) {
            const oldPos = joueur.position;
            joueur.position = target.position;
            target.position = oldPos;
            
            await joueur.save();
            await target.save();
            
            finalMessageText += `\n🔀 **CASE ÉCHANGE (Jet : ${roll}) !** Il échange sa position avec **<@${target.discord_id}>** (${desc}) !`;
            if (channel) {
                channel.send(`🔀 **ÉCHANGE !** **<@${userId}>** atterrit sur la case échange, fait un **${roll}** et échange sa place avec **<@${target.discord_id}>** (${desc}) !`);
            }
        } else {
            finalMessageText += `\n🔀 **CASE ÉCHANGE (Jet : ${roll}) !** Aucune cible valide trouvée, rien ne se passe.`;
        }
    }

    // Sauvegarde et notification finale
    await joueur.save();
    clearBoardCache();

    // Rendu Canvas final de la zone d'arrivée du joueur actif
    if (channel) {
        const destZone = getCase(joueur.position).zone;
        let tousLesJoueurs = await Joueur.findAll();
        tousLesJoueurs = tousLesJoueurs.sort((a, b) => a.discord_id === userId ? 1 : b.discord_id === userId ? -1 : 0);
        
        const { generateBoardImage } = require('../../utils/canvas');
        const buffer = await generateBoardImage(tousLesJoueurs, plateau, interaction.client, destZone);
        const attachment = new AttachmentBuilder(buffer, { name: 'board.png' });
        await channel.send({ content: finalMessageText, files: [attachment] });
    }

    // Message privé à renvoyer
    let mData = joueur.mode_data || {};
    if (mData.double_lancer) {
        await interaction.editReply({ 
            content: `🚶 Déplacement terminé sur la case **${joueur.position}** ! Tu as obtenu un **DOUBLE** : utilise la commande \`/jouer\` immédiatement pour faire ton lancer gratuit standard !`, 
            components: [] 
        }).catch(()=>{});
    } else {
        await interaction.editReply({ 
            content: `🚶 Déplacement terminé sur la case **${joueur.position}** ! Rendez-vous demain après la prochaine énigme !`, 
            components: [] 
        }).catch(()=>{});
    }

    unlockUser(userId);
}

// Handler de choix de direction interactive (Embranchement)
async function handleDirectionChoice(interaction) {
    const userId = interaction.user.id;
    try {
        await interaction.deferUpdate().catch(()=>{});
        
        if (!lockUser(userId)) return;

        const joueur = await Joueur.findByPk(userId);
        if (!joueur || joueur.cases_restantes <= 0) {
            unlockUser(userId);
            return;
        }

        const customId = interaction.customId; // 'choix_direction_left' ou 'choix_direction_right'
        const currentCase = getCase(joueur.position);
        
        // Tirage pile ou face (50/50) dynamique anti-triche
        const estPiege = Math.random() < 0.5;
        const channel = interaction.client.channels.cache.get(config.boardChannelId);

        if (estPiege) {
            // Chute à l'eau !
            const receptionCase = currentCase.id === 14 ? 10 : 31; // Réception chute eau Plage (10) ou Volcan (31)
            joueur.position = receptionCase;
            joueur.cases_restantes = 0; // Terminer le tour immédiatement
            await joueur.save();
            clearBoardCache();

            const pathText = customId === 'choix_direction_left' ? 'la GAUCHE' : 'la DROITE';
            if (channel) {
                channel.send(`🌊💦 **PLOUF !** **<@${userId}>** a choisi ${pathText} à l'intersection, mais s'est fait surprendre par une cascade ! Il tombe à l'eau et est ramené à la case **${receptionCase}** ! Son tour s'arrête là.`);
            }
            
            await interaction.editReply({ content: `🌊💦 **Plouf !** Mauvais choix, tu es tombé dans l'eau ! Tu es ramené à la case **${receptionCase}** et ton tour est fini.`, components: [] }).catch(()=>{});
            unlockUser(userId);
        } else {
            // Sûr : Enregistrer le choix de direction
            const choiceIndex = customId === 'choix_direction_left' ? 0 : 1;
            const chosenPath = currentCase.next[choiceIndex];
            
            joueur.temp_choix_direction = chosenPath;
            await joueur.save();

            const pathText = customId === 'choix_direction_left' ? 'la GAUCHE' : 'la DROITE';
            if (channel) {
                channel.send(`🛤️ **<@${userId}>** a pris ${pathText} à l'intersection et poursuit sa route en toute sécurité !`);
            }

            unlockUser(userId);
            await handleContinuerDeplacement(interaction, ['choix_direction']);
        }
    } catch(e) {
        console.error(e);
        unlockUser(userId);
    }
}

// Handler de résolution Portail, Cascade ou combat de Dragon (acheter_etoile)
async function handleAcheterEtoile(interaction) {
    const userId = interaction.user.id;
    try {
        await interaction.deferUpdate().catch(()=>{});
        
        if (!lockUser(userId)) return;

        const joueur = await Joueur.findByPk(userId);
        if (!joueur) {
            unlockUser(userId);
            return;
        }

        const plateau = await Plateau.findByPk(1);
        let pData = plateau.mode_data || {};
        pData.portails_ouverts = pData.portails_ouverts || [];
        pData.cascade_desactivee = pData.cascade_desactivee || false;

        const channel = interaction.client.channels.cache.get(config.boardChannelId);
        
        // 1. Combat du Dragon (Case 73)
        if (joueur.position === 73) {
            const deStandard = Math.floor(Math.random() * 6) + 1;
            let deBonus = 0;
            
            let mData = joueur.mode_data || {};
            const bonusDe = mData.bonus_de || 'none';
            if (bonusDe === 'gold') deBonus = Math.floor(Math.random() * 8) + 1;
            else if (bonusDe === 'silver') deBonus = Math.floor(Math.random() * 3) + 1;
            else if (bonusDe === 'bronze' || bonusDe === 'chocolat') deBonus = Math.floor(Math.random() * 2) + 1;
            
            const totalScore = deStandard + deBonus;
            
            // Annonce combat
            let textCombat = `⚔️ **<@${userId}> attaque le Dragon !**\n🎲 Jet : **${deStandard}**`;
            if (deBonus > 0) textCombat += ` + **${deBonus}** (dé ${bonusDe.toUpperCase()})`;
            textCombat += ` = Score total de **${totalScore}** !`;

            if (totalScore >= 6) {
                // VICTOIRE !
                textCombat += `\n🏆🐉 **VICTOIRE ! LE DRAGON EST TERRASSÉ !** 🐉👑`;
                
                // Enregistrer le vainqueur dans la jauge du plateau
                let gagnants = pData.gagnants_dragon || [];
                if (!gagnants.includes(userId)) {
                    gagnants.push(userId);
                    pData.gagnants_dragon = gagnants;
                }
                plateau.mode_data = pData;
                await plateau.save();

                if (channel) {
                    channel.send(`🏆🐉 **LE DRAGON EST TERRASSÉ !** **<@${userId}>** a battu le Dragon avec un score héroïque de **${totalScore}** ! La saison touche à sa fin ! 🐉👑`);
                }
                
                await interaction.editReply({ content: `🏆🐉 **FÉLICITATIONS !** Tu as terrassé le Dragon avec un score de ${totalScore} ! La victoire finale sera annoncée officiellement à 17h !`, components: [] }).catch(()=>{});
            } else {
                // ÉCHEC
                textCombat += `\n😢 Le Dragon rugit et repousse l'attaque... Échec !`;
                
                if (channel) {
                    channel.send(`😢 **ÉCHEC !** **<@${userId}>** a attaqué le Dragon mais son score de **${totalScore}** était insuffisant. Il reste coincé sur la case finale pour retenter demain !`);
                }
                
                await interaction.editReply({ content: `😢 **Échec...** Ton score de ${totalScore} n'a pas suffi à battre le Dragon. Tu restes sur la case 73 et pourras retenter demain !`, components: [] }).catch(()=>{});
            }
            
            unlockUser(userId);
            return;
        }

        // 2. Portail (Case 19 pour Portail 20, Case 47 pour Portail 48)
        const currentCase = getCase(joueur.position);
        const nextCaseId = currentCase.next[0];
        const nextCaseObj = getCase(nextCaseId);

        if (nextCaseObj && nextCaseObj.type === 'Portail') {
            const challengeRoll = Math.floor(Math.random() * 6) + 1;
            
            if (challengeRoll >= 4) {
                // Réussite ! Le portail s'ouvre pour TOUT LE MONDE
                pData.portails_ouverts.push(nextCaseId);
                plateau.mode_data = pData;
                await plateau.save();
                
                if (channel) {
                    channel.send(`🚪✨ **OUVERTURE DE PORTAIL !** **<@${userId}>** a obtenu un **${challengeRoll}** et ouvert le Portail à la case **${nextCaseId}** pour tout le monde ! 🥳🎉`);
                }

                await interaction.editReply({ content: `🚪✨ **Succès !** Tu as fait un **${challengeRoll}** et déverrouillé le portail ! Ton déplacement continue.`, components: [] }).catch(()=>{});
                
                unlockUser(userId);
                // Continuer la course
                await handleContinuerDeplacement(interaction, ['portail']);
            } else {
                // Échec ! Le tour s'arrête devant le portail
                joueur.cases_restantes = 0;
                await joueur.save();
                clearBoardCache();

                if (channel) {
                    channel.send(`🚪🔒 **ÉCHEC PORTAIL !** **<@${userId}>** a fait un **${challengeRoll}** et reste coincé devant le Portail case **${nextCaseId}** pour ce tour !`);
                }

                await interaction.editReply({ content: `🚪🔒 **Échec...** Tu as fait un **${challengeRoll}** (il fallait 4+). Ton tour s'arrête net devant le portail !`, components: [] }).catch(()=>{});
                unlockUser(userId);
            }
            return;
        }

        // 3. Cascade (Case 38)
        if (currentCase.type === 'Cascade') {
            const challengeRoll = Math.floor(Math.random() * 6) + 1;
            
            if (challengeRoll >= 3) {
                // Réussite ! La cascade est désactivée pour TOUT LE MONDE
                pData.cascade_desactivee = true;
                plateau.mode_data = pData;
                await plateau.save();
                
                if (channel) {
                    channel.send(`🌊✨ **EXPLOIT DE LA CASCADE !** **<@${userId}>** a obtenu un **${challengeRoll}** et a désactivé le piège de la Cascade case **${currentCase.id}** pour tout le monde ! 🛡️👏`);
                }

                await interaction.editReply({ content: `🌊✨ **Succès !** Tu as fait un **${challengeRoll}** et traversé la cascade ! Ton déplacement continue.`, components: [] }).catch(()=>{});
                
                unlockUser(userId);
                // Continuer la course
                await handleContinuerDeplacement(interaction, ['cascade']);
            } else {
                // Échec ! Chute à l'eau immédiate et fin du tour
                const receptionCase = 31; // Case de réception d'eau du volcan
                joueur.position = receptionCase;
                joueur.cases_restantes = 0;
                await joueur.save();
                clearBoardCache();

                if (channel) {
                    channel.send(`🌊💦 **PLOUF !** **<@${userId}>** a fait un **${challengeRoll}** (il fallait 3+) et s'est fait emporter par la Cascade ! Il est ramené à la case **${receptionCase}** et son tour prend fin !`);
                }

                await interaction.editReply({ content: `🌊💦 **Plouf !** Tu as fait un **${challengeRoll}**. Tu tombes dans l'eau et es ramené à la case **${receptionCase}** ! Ton tour est terminé.`, components: [] }).catch(()=>{});
                unlockUser(userId);
            }
            return;
        }

        unlockUser(userId);
    } catch(e) {
        console.error(e);
        unlockUser(userId);
    }
}

// Handler de Saut Liane (passer_etoile)
async function handlePasserEtoile(interaction) {
    const userId = interaction.user.id;
    try {
        await interaction.deferUpdate().catch(()=>{});
        
        if (!lockUser(userId)) return;

        const joueur = await Joueur.findByPk(userId);
        if (!joueur || joueur.cases_restantes <= 0) {
            unlockUser(userId);
            return;
        }

        const currentCase = getCase(joueur.position);
        
        if (currentCase.type === 'Liane') {
            const bonusRoll = Math.floor(Math.random() * 6) + 1; // 1d6 supplémentaire 100% positif
            joueur.cases_restantes = bonusRoll;
            await joueur.save();

            const channel = interaction.client.channels.cache.get(config.boardChannelId);
            if (channel) {
                channel.send(`🦧✨ **SAUT LIANE !** **<@${userId}>** s'élance à la liane et fait un bond spectaculaire de **+${bonusRoll} cases** en avant ! 🚀🌴`);
            }

            await interaction.editReply({ content: `🦧✨ **Saut Liane !** Tu t'élances et fais un bond de **+${bonusRoll} cases** supplémentaires !`, components: [] }).catch(()=>{});
            
            unlockUser(userId);
            await handleContinuerDeplacement(interaction, ['liane']);
        } else {
            unlockUser(userId);
        }
    } catch(e) {
        console.error(e);
        unlockUser(userId);
    }
}

// Stubs/No-ops pour les autres fonctions proxies requises par le bot pour éviter les crashs
module.exports = {
    activeInteractionTokens,
    handleLancerDe,
    handleContinuerDeplacement,
    handleDirectionChoice,
    handleAcheterEtoile,
    handlePasserEtoile,
    async handleUnblockFantome(interaction) {
        const userId = interaction.user.id;
        try {
            await interaction.deferUpdate().catch(()=>{});
            const j = await Joueur.findByPk(userId);
            if (j && j.est_fantome && !j.fantome_unblock_used) {
                j.est_fantome = false;
                j.fantome_unblock_used = true;
                j.a_le_droit_de_jouer = true;
                await j.save();
                clearBoardCache();
                const channel = interaction.client.channels.cache.get(config.boardChannelId);
                if (channel) channel.send(`🔓 **<@${userId}>** utilise son déblocage unique et revient dans l'aventure !`);
                await interaction.editReply({ content: "🔓 Te voilà débloqué ! Tu peux rejouer dès aujourd'hui !", components: [] });
            }
        } catch(e) { console.error(e); }
    },
    async handleUtiliserObjet(interaction) {
        await interaction.reply({ content: "Les objets ne sont pas activés dans le mode course de l'Île aux défis.", flags: 64 });
    },
    async handleUseItem(interaction) {
        await interaction.reply({ content: "Les objets ne sont pas activés dans le mode course de l'Île aux défis.", flags: 64 });
    },
    async handleDePipeChoix(interaction) {
        await interaction.reply({ content: "Action non disponible.", flags: 64 });
    },
    async handleBooChoice(interaction) {
        await interaction.reply({ content: "Action non disponible.", flags: 64 });
    },
    async handleBooTarget(interaction) {
        await interaction.reply({ content: "Action non disponible.", flags: 64 });
    },
    async handleBuyItem(interaction) {
        await interaction.reply({ content: "Action non disponible.", flags: 64 });
    },
    async handleBuyCancel(interaction) {
        await interaction.reply({ content: "Action non disponible.", flags: 64 });
    },
    async handleReplaceBuy(interaction) {
        await interaction.reply({ content: "Action non disponible.", flags: 64 });
    },
    async handleReplaceChance(interaction) {
        await interaction.reply({ content: "Action non disponible.", flags: 64 });
    }
};
