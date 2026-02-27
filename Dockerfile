FROM node:18-bullseye-slim

# Installer les dépendances système requises par node-canvas
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances Node.js
RUN npm install

# Copier le reste du code
COPY . .

# Créer le dossier pour la base de données
RUN mkdir -p /app/data

# Démarrer l'application
CMD ["npm", "start"]
