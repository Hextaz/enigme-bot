const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('documentation')
        .setDescription('Affiche les règles complètes et le fonctionnement du jeu.'),
    async execute(interaction) {
        const embedRegles = new EmbedBuilder()
            .setTitle('📖 Concept & Règles de base')
            .setColor('#3498db')
            .setDescription(`Le but du jeu est de récolter le plus d'**Étoiles ⭐** (les pièces 🪙 servent à départager en cas d'égalité).\\n\\n` +
            `**1. L'Énigme du jour**\\n` +
            `Chaque jour, le MJ poste une énigme. Proposer des réponses te rapporte **1 pièce par message** (max 5/jour). Trouver la bonne réponse rapporte **10 pièces**.\\n\\n` +
            `**2. Jouer sur le plateau**\\n` +
            `Tu as le droit à **1 lancer de dé par jour**. Le droit de jouer est réinitialisé tous les jours à **11h00**. Tu pourras lancer un dé (1 à 6) et avancer sur le plateau.\\n\\n` +
            `**3. L'Étoile et la Boutique (Passer devant)**\\n` +
            `L'Étoile se trouve sur une case du plateau. Si tu **passes devant** ou t'arrêtes dessus, ton déplacement se met en pause. Tu peux l'acheter pour **20 pièces**. Ensuite, tu continues d'avancer de tes cases restantes. Même chose pour la Boutique !`);

        const embedCases = new EmbedBuilder()
            .setTitle('🗺️ Les Cases du Plateau')
            .setColor('#2ecc71')
            .setDescription(
            `🟩 **Verte / Départ** : Case neutre.\\n` +
            `🟦 **Bleue** : +3 pièces.\\n` +
            `🟥 **Rouge** : -3 pièces.\\n` +
            `🍀 **Chance** : Bonus aléatoire (pièces, objet, vol, sac plein).\\n` +
            `🌩️ **Malchance** : Malus aléatoire (perte de pièces, objet, dé limité, TP Bowser).\\n` +
            `👻 **Boo** : Permet de voler des pièces (gratuit) ou une Étoile (coûte 50 pièces) à un autre joueur. *(Il faut atterrir pile dessus)*\\n` +
            `🔥 **Bowser** : Événement catastrophique (perte de moitié des pièces, perte d'étoile, révolution communiste, etc.). *(Il faut atterrir pile dessus)*\\n` +
            `🎭 **Coup du Sort** : Événement global aléatoire (échange de places, loterie, duel de dés, etc.).\\n` +
            `🛒 **Boutique** : Permet d'acheter des objets avec tes pièces. *(Tu peux passer devant)*`);

        const embedObjets = new EmbedBuilder()
            .setTitle('🎒 Les Objets')
            .setColor('#e67e22')
            .setDescription(
            `Tu peux avoir maximum **3 objets** dans ton inventaire. Tu peux en utiliser un avant de lancer ton dé.\\n\\n` +
            `🍄 **Champignon** (5p) : +3 au prochain lancer.\\n` +
            `🎲 **Double Dé** (10p) : Lance 2 dés (2 à 12).\\n` +
            `🎲 **Dé Triple** (15p) : Lance 3 dés (3 à 18).\\n` +
            `🎯 **Dé Pipé** (15p) : Choisis le résultat de ton dé (1 à 6).\\n` +
            `🪞 **Miroir** (15p) : Échange ta position avec un joueur aléatoire.\\n` +
            `🧪 **Tuyau** (10p) : Téléportation aléatoire.\\n` +
            `🏆 **Tuyau Doré** (25p) : Téléportation juste devant l'Étoile.\\n` +
            `🎺 **Sifflet** (15p) : Déplace l'Étoile sur une autre case.\\n` +
            `🪤 **Piège à pièces** (10p) / **Piège à Étoile** (20p) : Pose un piège sur ta case actuelle. Le premier qui s'y arrête subit le piège et te donne son butin.`);

        const embedEvents = new EmbedBuilder()
            .setTitle('📅 Événements Spéciaux')
            .setColor('#9b59b6')
            .setDescription(
            `🎰 **Samedi (Les Paris)**\\n` +
            `Le samedi, il n'y a pas de lancer de dé. À la place, tu peux parier tes pièces sur le joueur qui trouvera l'énigme du dimanche. Si tu gagnes, tu remportes ta mise multipliée par la moitié du nombre de joueurs !\\n\\n` +
            `🏴‍☠️ **Dimanche (Marché Noir)**\\n` +
            `Le dimanche, la boutique classique est remplacée par le Marché Noir. Tu y trouveras des objets exclusifs et surpuissants (Tuyau Doré, Dé Pipé, Piège à Étoile, Pack de 3 objets).`);

        await interaction.reply({
            embeds: [embedRegles, embedCases, embedObjets, embedEvents],
            ephemeral: true
        });
    },
};
