# 🎲 Règles de Jeu & Game Design — Enigme Bot

Ce document détaille l'intégralité des mécaniques, cycles journaliers et règles économiques d'**Enigme Bot**. Il sert de référence pour comprendre le fonctionnement du jeu et préserver son équilibre lors du développement de nouvelles fonctionnalités.

---

## 🌟 Le Concept

**Enigme Bot** fusionne le plaisir d'une énigme quotidienne avec la dynamique compétitive d'un jeu de plateau à la **Mario Party** :
1. Les joueurs résolvent une énigme quotidienne pour remporter des pièces.
2. Ils utilisent leurs pièces pour acheter des objets en boutique et acquérir des **Étoiles**.
3. Ils lancent leur dé pour progresser sur un plateau dynamique généré en temps réel avec leurs avatars.
4. Le joueur avec le plus d'Étoiles (et de pièces en cas d'égalité) à la fin de la saison (tour 30) remporte la partie.

---

## ⏰ Le Cycle Quotidien d'une Journée

Une partie se déroule au rythme d'un tour par jour selon un planning automatisé par cron :

| Heure | Événement | Description |
| :--- | :--- | :--- |
| **17h00** | **Publication de l'Énigme** | L'énigme du jour est postée sur le salon des énigmes. Le plateau se verrouille pour laisser place à la réflexion. |
| **21h00** | **Clôture & Récompenses** | L'énigme se ferme. Les joueurs ayant trouvé la bonne réponse via `/deviner` reçoivent leurs pièces. Le plateau s'ouvre et chaque joueur actif gagne son droit de lancer le dé (`a_le_droit_de_jouer = true`). |
| **21h00 ➔ 17h00** | **Fenêtre de Jeu** | Les joueurs ont 20 heures pour utiliser `/jouer`, consommer des objets et lancer leur dé. |
| **15h00** | **Rappel des Retardataires** | Un message de rappel discret est envoyé en MP aux joueurs n'ayant pas encore lancé leur dé pour le tour en cours. |

---

## 🎯 Déroulement d'un Tour de Jeu (`/jouer`)

Quand un joueur tape `/jouer`, il accède à son menu personnel éphémère :

1. **Préparation & Objets** :
   - Le joueur peut consulter son inventaire (3 objets maximum).
   - Il peut activer un objet avant de lancer son dé (ex: Champignon, Dé Pipé).
2. **Lancer de Dé** :
   - Le joueur lance un dé à 6 faces (1 à 6 de base, ou plus selon l'objet utilisé).
3. **Déplacement & Mécanique "Passer Devant"** :
   - Le joueur avance case par case.
   - **Pause Étoile** : S'il franchit la case où se situe l'Étoile, son déplacement se met en pause. Le bot lui propose d'acheter l'Étoile pour **20 pièces**. Qu'il l'achète ou non, son déplacement reprend immédiatement pour les cases restantes. S'il achète l'étoile, celle-ci réapparaît aussitôt sur une autre case aléatoire.
   - **Pause Boutique** : S'il franchit la Boutique de Toad, le déplacement se met en pause pour lui proposer le catalogue du jour. Il continue ensuite son chemin.
4. **Atterrissage sur une Case** :
   - L'effet de la case finale est résolu (voir ci-dessous).
   - La nouvelle image du plateau est générée et postée dans le salon public.

---

## 🟦 Types de Cases sur le Plateau

| Case | Symbole | Effet à l'Atterrissage |
| :--- | :---: | :--- |
| **Case Bleue** | 🟦 | Le joueur gagne **+3 pièces**. |
| **Case Rouge** | 🟥 | Le joueur perd **-3 pièces** (le solde ne peut pas descendre sous 0). |
| **Case Chance** | 🍀 | Déclenche la roulette Chance (gain de 10 à 20 pièces, objet gratuit ou échange avantageux). |
| **Case Malchance** | 🌩️ | Déclenche la roulette Malchance (perte de 5 à 15 pièces ou distribution de pièces aux adversaires). |
| **Case Boo** | 👻 | Permet de voler gratuitement des pièces à un adversaire ciblé, ou de voler une **Étoile** pour **50 pièces**. |
| **Case Bowser** | 🔥 | Événement destructeur orchestré par Bowser (vol de la moitié des pièces, taxe universelle, reset de position). |
| **Coup du Sort** | 🎭 | La roulette échange aléatoirement la position ou les pièces de deux joueurs ! |
| **Case Étoile** | ⭐ | Emplacement de l'Étoile active (20 pièces). |
| **Boutique** | 🏪 | Permet d'acheter des objets stratégiques. |

---

## 🎒 Objets & Inventaire

Chaque joueur peut stocker un maximum de **3 objets** dans son inventaire :

* 🍄 **Champignon** : Ajoute +5 au résultat du dé.
* 🍄✨ **Super Champignon** : Ajoute +10 au résultat du dé.
* 🎲 **Dé Pipé / Dé Doré** : Permet de choisir exactement le chiffre de son dé (de 1 à 10).
* 🟢 **Tuyau Téléporteur** : Téléporte le joueur directement à 1 case de l'Étoile active !
* 🪤 **Pièges (Banane, Bombe)** : À poser sur une case pour piéger le prochain adversaire qui passera dessus.

---

## 📅 Événements Spéciaux du Week-End

Pour briser la routine en fin de semaine, le samedi et le dimanche ont des règles uniques :

### Samedi 10h : Les Paris du Samedi
* Le samedi, les lancers de dés classiques sont suspendus.
* Les joueurs peuvent miser des pièces sur le joueur qui trouvera le plus vite l'énigme du dimanche.
* Les gains sont distribués le dimanche selon les cotes calculées par le bot.

### Dimanche 11h : Le Marché Noir
* Une boutique clandestine s'ouvre avec des objets légendaires non disponibles le reste de la semaine (Tuyaux dorés, Clés dérobées, Malédictions).

---

## 👻 Système d'Inactivité & Statut Fantôme

Pour éviter que des joueurs inactifs ne bloquent la dynamique ou ne profitent d'événements sans jouer :
* Si un joueur ne joue pas pendant **3 jours consécutifs** (`jours_inactifs >= 3`), il est transformé en **Fantôme** (`est_fantome = true`).
* Un joueur fantôme est immobilisé sur le plateau, ne gagne plus de droit de jouer quotidien à 21h, et ne peut plus utiliser ses objets tant qu'il n'est pas réanimé par le MJ ou par une énigme de rédemption.

---

## 🏆 Fin de Saison & Podiums

* Une saison classique dure **30 tours**.
* À l'issue du 30ème tour (ou via la commande `/admin stop`), le podium final est calculé :
  1. Nombre d'Étoiles.
  2. En cas d'égalité : Nombre de Pièces.
  3. En cas d'égalité parfaite : Départage aux dés ou ex-aequo.
* Une annonce solennelle avec palmarès est publiée sur le salon du plateau.
