const { createCanvas, loadImage } = require('canvas');
const { BOARD_CASES, getCase } = require('../game/board');
const path = require('path');

const CASE_SIZE = 90;
const BOARD_WIDTH = 1920;
const BOARD_HEIGHT = 1080;

// Fonction utilitaire pour dessiner une image en cercle
function drawCircleImage(ctx, img, x, y, radius, borderColor = '#FFFFFF') {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2, true);
    ctx.clip();
    ctx.closePath();
    ctx.restore();

    // Bordure
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2, true);
    ctx.lineWidth = 3;
    ctx.strokeStyle = borderColor;
    ctx.stroke();
}

// Fonction utilitaire pour dessiner une étoile
function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius, fillColor, strokeColor) {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    let step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
}

async function generateBoardImage(joueurs, plateau, client) {
    const canvas = createCanvas(BOARD_WIDTH, BOARD_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Charger l'image de fond
    try {
        const bgImage = await loadImage(path.join(__dirname, '../../assets/plateau.png'));
        ctx.drawImage(bgImage, 0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    } catch (error) {
        console.error("Image de fond non trouvée, utilisation d'un fond uni.");
        ctx.fillStyle = '#2C2F33';
        ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    }

    // Afficher le numéro du tour en haut à droite
    if (plateau && plateau.tour) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(BOARD_WIDTH - 250, 20, 230, 60);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Tour ${plateau.tour}/30`, BOARD_WIDTH - 135, 50);
    }

    // Dessiner l'étoile
    if (plateau && plateau.position_etoile) {
        const etoileCase = getCase(plateau.position_etoile);
        if (etoileCase) {
            drawStar(ctx, etoileCase.x + 45, etoileCase.y - 60, 5, 25, 12, '#FFD700', '#000000');
        }
    }

    // Regrouper les joueurs par case
    const joueursParCase = {};
    for (const joueur of joueurs) {
        if (!joueursParCase[joueur.position]) {
            joueursParCase[joueur.position] = [];
        }
        joueursParCase[joueur.position].push(joueur);
    }

    for (const [position, joueursSurCase] of Object.entries(joueursParCase)) {
        const c = getCase(parseInt(position));
        if (!c) continue;

        // Trier pour que le joueur actif (s'il y en a un) soit dessiné en dernier
        // On suppose que le joueur actif a été passé en dernier dans le tableau 'joueurs'
        // ou on peut juste garder l'ordre d'arrivée si on trie avant l'appel.
        // Pour l'instant, on garde l'ordre du tableau 'joueurs' qui devrait être géré en amont.

        for (let i = 0; i < joueursSurCase.length; i++) {
            const joueur = joueursSurCase[i];
            
            const radius = 30; // 60x60 pixels
            let px = c.x + 45; // Décalage vers la droite pour centrer sur la case (car x,y est le coin supérieur gauche de la case)
            let py = c.y - 45; // Décalage vers le haut pour être au-dessus de la case

            if (joueursSurCase.length === 2) {
                // 2 joueurs : côte à côte
                px += (i === 0) ? -15 : 15;
            } else if (joueursSurCase.length >= 3) {
                // 3 joueurs ou plus : petite pyramide
                if (i === 0) { px -= 15; py += 10; }
                else if (i === 1) { px += 15; py += 10; }
                else if (i === 2) { py -= 15; }
                else {
                    // S'il y en a plus de 3, on les décale un peu aléatoirement ou en cercle
                    const angle = (i / joueursSurCase.length) * Math.PI * 2;
                    px += Math.cos(angle) * 15;
                    py += Math.sin(angle) * 15;
                }
            }

            try {
                let avatarUrl = null;
                let user = null;
                if (client) {
                    user = await client.users.fetch(joueur.discord_id).catch(() => null);
                    if (user) {
                        avatarUrl = user.displayAvatarURL({ extension: 'png', size: 128 });
                    }
                }
                
                if (avatarUrl) {
                    const avatarImg = await loadImage(avatarUrl);
                    drawCircleImage(ctx, avatarImg, px, py, radius, '#FFD700');
                } else {
                    // Fallback si pas d'avatar
                    ctx.fillStyle = '#FFFFFF';
                    ctx.beginPath();
                    ctx.arc(px, py, radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = '#FFD700';
                    ctx.stroke();
                    
                    ctx.fillStyle = '#000000';
                    ctx.font = '20px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const fallbackText = user ? user.username.substring(0, 2).toUpperCase() : '?';
                    ctx.fillText(fallbackText, px, py);
                }
            } catch (e) {
                console.error(`Erreur lors du chargement de l'avatar pour ${joueur.discord_id}`, e);
            }
        }
    }

    return canvas.toBuffer();
}

async function generateZoomedBoardImage(joueur, tousLesJoueurs, plateau, client) {
    const canvas = createCanvas(800, 200);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#2C2F33';
    ctx.fillRect(0, 0, 800, 200);

    const startPos = joueur.position - 2;
    const endPos = joueur.position + 6;
    
    let drawX = 80;
    const drawY = 100;
    const spacing = 90;

    for (let i = startPos; i <= endPos; i++) {
        const c = getCase(i);
        if (!c) continue;

        // Déterminer la couleur de la case
        let caseColor = '#4F545C'; // Défaut (gris)
        if (c.type === 'Bleue') caseColor = '#3498db';
        else if (c.type === 'Rouge') caseColor = '#e74c3c';
        else if (c.type === 'Chance') caseColor = '#2ecc71';
        else if (c.type === 'Malchance') caseColor = '#9b59b6';
        else if (c.type === 'Bowser') caseColor = '#c0392b';
        else if (c.type === 'Coup du Sort') caseColor = '#f1c40f';
        else if (c.type === 'Boo') caseColor = '#ecf0f1';
        else if (c.type === 'Boutique') caseColor = '#e67e22';

        // Dessiner un cercle pour représenter la case
        ctx.fillStyle = caseColor;
        ctx.beginPath();
        ctx.arc(drawX, drawY, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = i === joueur.position ? '#FFD700' : '#000000';
        ctx.stroke();

        // Type de case (texte simple pour la vue zoomée)
        ctx.fillStyle = (c.type === 'Boo' || c.type === 'Coup du Sort') ? '#000000' : '#FFFFFF';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.id.toString(), drawX, drawY - 20);
        
        // Nom du type en tout petit
        ctx.font = '10px Arial';
        ctx.fillText(c.type.substring(0, 6), drawX, drawY);

        // Étoile
        if (plateau && plateau.position_etoile === c.id) {
            drawStar(ctx, drawX, drawY - 50, 5, 15, 7, '#FFD700', '#000000');
        }

        // Pièges (icône Attention si devant le joueur)
        if (plateau && plateau.pieges_actifs) {
            const piege = plateau.pieges_actifs.find(p => p.position === c.id);
            if (piege && i > joueur.position) {
                ctx.font = '25px Arial';
                ctx.fillText('⚠️', drawX, drawY + 30);
            }
        }

        // Joueurs sur cette case
        const joueursIci = tousLesJoueurs.filter(j => j.position === c.id);
        if (joueursIci.length > 0) {
            // On dessine juste le nombre de joueurs ou l'avatar du joueur actuel
            if (i === joueur.position) {
                try {
                    let avatarUrl = null;
                    if (client) {
                        const user = await client.users.fetch(joueur.discord_id).catch(() => null);
                        if (user) {
                            avatarUrl = user.displayAvatarURL({ extension: 'png', size: 64 });
                        }
                    }
                    if (avatarUrl) {
                        const avatarImg = await loadImage(avatarUrl);
                        drawCircleImage(ctx, avatarImg, drawX, drawY + 10, 20, '#FFD700');
                    }
                } catch (e) {}
            } else {
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.arc(drawX, drawY + 10, 15, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                
                ctx.fillStyle = '#000000';
                ctx.font = '14px Arial';
                ctx.fillText(joueursIci.length.toString(), drawX, drawY + 10);
            }
        }

        drawX += spacing;
    }

    return canvas.toBuffer();
}

module.exports = {
    generateBoardImage,
    generateZoomedBoardImage
};
