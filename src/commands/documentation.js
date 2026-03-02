const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('documentation')
        .setDescription('Affiche les règles complètes et le fonctionnement du jeu.'),
    async execute(interaction) {
        const embedRegles = new EmbedBuilder()
            .setTitle('📖 Concept & Règles de base')
            .setColor('#3498db')
            .setDescription(`Le but du jeu est de récolter le plus d'**Étoiles ⭐** (les pièces 🪙 servent à départager en cas d'égalité).\n\n` +
            `**1. L'Énigme du jour**\n` +
            `Chaque jour, le MJ poste l'énigme du jour. Utilise la commande \`/deviner [mot]\` pour faire une proposition. Chaque participation te rapporte **1 pièce** (max 5/jour) et tu peux tenter ta chance toutes les 30 minutes. Le premier à trouver rapporte **10 pièces** (et 5 pièces pour les retardataires dans les 30 minutes suivantes).\n\n` +
            `**2. Jouer sur le plateau**\n` +
            `Tu as le droit à **1 lancer de dé par jour**. Le droit de jouer est réinitialisé tous les jours à **11h00**. Tu pourras lancer un dé (1 à 6) et avancer sur le plateau.\n\n` +
            `**3. L'Étoile et la Boutique (Passer devant)**\n` +
            `L'Étoile se trouve sur une case du plateau. Si tu **passes devant** ou t'arrêtes dessus, ton déplacement se met en pause. Tu peux l'acheter pour **20 pièces**. Ensuite, tu continues d'avancer de tes cases restantes. Même chose pour la Boutique !`);

        const embedCases = new EmbedBuilder()
            .setTitle('🗺️ Les Cases du Plateau')
            .setColor('#2ecc71')
            .setDescription(
            `🟩 **Verte / Départ** : Case neutre.\n` +
            `🟦 **Bleue** : +3 pièces.\n` +
            `🟥 **Rouge** : -3 pièces.\n` +
            `🍀 **Chance** : Bonus aléatoire (pièces, objet, vol, sac plein).\n` +
            `🌩️ **Malchance** : Malus aléatoire (perte de pièces, objet, dé limité, TP Bowser).\n` +
            `👻 **Boo** : Permet de voler des pièces (gratuit) ou une Étoile (coûte 50 pièces) à un autre joueur. *(Il faut atterrir pile dessus)*\n` +
            `🔥 **Bowser** : Événement catastrophique (perte de moitié des pièces, perte d'étoile, révolution communiste, etc.). *(Il faut atterrir pile dessus)*\n` +
            `🎭 **Coup du Sort** : Événement global aléatoire (échange de places, loterie, duel de dés, etc.).\n` +
            `🛒 **Boutique** : Permet d'acheter des objets avec tes pièces. *(Tu peux passer devant)*`);

        const embedObjets = new EmbedBuilder()
            .setTitle('🎒 Les Objets')
            .setColor('#e67e22')
            .setDescription(
            `Tu peux avoir maximum **3 objets** dans ton inventaire. Tu peux en utiliser un avant de lancer ton dé.\n\n` +
            `🍄 **Champignon** (5p) : +3 au prochain lancer.\n` +
            `💰 **Piège à pièces** (5p) : Vole 10 pièces au prochain marcheur.\n` +
            `🧪 **Tuyau** (8p) : Téléportation aléatoire.\n` +
            `🎯 **Dé Pipé** (10p) : Choisis le résultat de ton dé (1 à 6).\n` +
            `🎲 **Double Dé** (12p) : Lance 2 dés (2 à 12).\n` +
            `🪞 **Miroir** (15p) : Échange ta position avec un joueur aléatoire.\n` +
            `🎺 **Sifflet** (15p) : Déplace l'Étoile sur une autre case.\n\n` +
            `*Objets exclusifs du Marché Noir (Dimanche) :*\n` +
            `🎲 **Dé Triple** (20p) : Lance 3 dés (3 à 18).\n` +
            `🏆 **Tuyau Doré** (25p) : Téléportation juste devant l'Étoile.\n` +
            `🌟 **Piège à Étoile** (30p) : Vole 1 Étoile au prochain marcheur.\n` +
            `🎁 **Packs Promo** (15p/25p) : Contient 2 objets.`);

        const embedEvents = new EmbedBuilder()
            .setTitle('📅 Événements Spéciaux')
            .setColor('#9b59b6')
            .setDescription(
            `🎰 **Samedi (Les Paris)**\n` +
            `Le samedi, il n'y a pas de lancer de dé. À la place, tu peux parier tes pièces sur une course de Yoshis ! Le système fonctionne comme les prédictions Twitch : tu mises sur un Yoshi, et si ton Yoshi gagne, tu remportes une part du pot total proportionnelle à ta mise. (Mise max : 30 pièces. Un ticket gratuit de 3 pièces est offert à tous !)\n\n` +
            `🏴‍☠️ **Dimanche (Marché Noir)**\n` +
            `Le dimanche, la boutique classique est remplacée par le Marché Noir. Tu y trouveras des objets exclusifs et surpuissants (Tuyau Doré, Dé Pipé, Piège à Étoile, Pack de 2 objets).`);

        const embedCommands = new EmbedBuilder()
            .setTitle('💻 Commandes Utilisateurs')
            .setColor('#f1c40f')
            .setDescription(
            `Voici la liste des commandes que tu peux utiliser pour jouer !\n\n` +
            `**\`/jouer\`**\n` +
            `Ouvre ton menu privé (éphémère). C'est depuis ce menu que tu peux lancer ton dé, voir ton inventaire, utiliser un objet, voir le plateau de près et ton classement ! C'est la commande principale du jeu.\n\n` +
            `**\`/deviner [réponse]\`**\n` +
            `Sers-toi de cette commande pour répondre à l'énigme du jour posée par le MJ ! Chaque tentative te rapporte 1 pièce de participation (max 5 / jour). Tu peux proposer un mot toutes les 30 minutes.\n\n` +
            `**\`/stats [joueur]\`**\n` +
            `Affiche un récapitulatif de tes statistiques (ou celles d'un autre joueur optionnel). Tu verras les pièces, les étoiles, la position sur le plateau, le classement général, et l'inventaire.\n\n` +
            `**\`/documentation\`**\n` +
            `Affiche ce message avec toutes les règles du jeu !`);

        await interaction.reply({
            embeds: [embedRegles, embedCases, embedObjets, embedEvents, embedCommands],
            ephemeral: true
        });
    },
};
