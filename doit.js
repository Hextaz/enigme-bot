const fs = require('fs');
let C = fs.readFileSync('src/game/cron.js', 'utf8');

const regex = /\/\/ Calculer le pot total et le total misé sur le gagnant[\s\S]*?if \(gagnantsCount === 0\) \{/m;

const replacement = `// Calculer le pot total et le total misé sur le gagnant
            let potTotal = 0;
            let totalMiseGagnant = 0;

            const { Op } = require('sequelize');
            const laBaseDeParis = await Joueur.findAll({
                where: {
                    pari_coureurId: {
                        [Op.ne]: null
                    }
                }
            });

            for (const p of laBaseDeParis) {
                potTotal += p.pari_montant;
                if (p.pari_coureurId === gagnant.id) {
                    totalMiseGagnant += p.pari_montant;
                }
            }

            let gagnantsCount = 0;

            if (totalMiseGagnant > 0) {
                for (const joueur of laBaseDeParis) {
                    if (joueur.pari_coureurId === gagnant.id) {
                        const part = joueur.pari_montant / totalMiseGagnant;
                        const gain = Math.floor(part * potTotal);

                        joueur.pieces += gain;
                        let oldMise = joueur.pari_montant;
                        joueur.pari_coureurId = null;
                        joueur.pari_montant = 0;
                        await joueur.save();

                        resultMsg += \`<@\${joueur.discord_id}> gagne **\${gain} pièces** (Mise: \${oldMise}) ! *(Total: \${joueur.pieces} 🪙)*\\n\`;
                        gagnantsCount++;
                    } else {
                        joueur.pari_coureurId = null;
                        joueur.pari_montant = 0;
                        await joueur.save();
                    }
                }
            } else {
                for (const joueur of laBaseDeParis) {
                    joueur.pari_coureurId = null;
                    joueur.pari_montant = 0;
                    await joueur.save();
                }
            }

            if (gagnantsCount === 0) {`;

if(C.match(regex)){
    C = C.replace(regex, replacement);
    fs.writeFileSync('src/game/cron.js', C);
    console.log("Success");
} else {
    console.log("No match");
}