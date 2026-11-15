# Archive SMS

> Un lecteur web progressif (PWA) et un site d’aide pour lire localement vos exports XML de **SMS Backup & Restore**.

## ✨ Fonctionnalités

- **Import d'un fichier XML** depuis SMS Backup & Restore
- **Liste des conversations** avec recherche
- **Affichage des SMS/MMS** et des pièces jointes
- **Stockage local** dans IndexedDB (sur l'appareil)
- **PWA Installable** sur écran d'accueil
- **Mode hors ligne** après premier chargement
- **Interface responsive** adaptée mobile/desktop
- **Interface français / anglais**, avec préférence mémorisée sur l’appareil

## 📱 Installation

### Utilisation en ligne
Site public : [https://clement1211.github.io/archive-sms](https://clement1211.github.io/archive-sms)

Lecteur : [https://clement1211.github.io/archive-sms/app/](https://clement1211.github.io/archive-sms/app/)

### Installation locale

1. Clonez ce dépôt :
   ```bash
   git clone https://github.com/Clement1211/archive-sms.git
   cd archive-sms
   ```

2. Installez les dépendances Jekyll et démarrez l’aperçu local :
   ```bash
   bundle install
   bundle exec jekyll serve
   ```

3. Ouvrez le site à l'adresse [http://localhost:4000](http://localhost:4000) ou directement le lecteur à [http://localhost:4000/app/](http://localhost:4000/app/).

## 📱 Utilisation sur iPhone

### Import depuis l'app Fichiers

1. **Transférez votre fichier XML** sur votre iPhone (par AirDrop, iCloud Drive, email, etc.)
2. **Ouvrez l'app Fichiers** sur votre iPhone
3. **Trouvez votre fichier XML** (dans iCloud Drive, Mes fichiers, ou une autre source)
4. **Appuyez et maintenez** sur le fichier, puis sélectionnez **"Partager"**
5. **Choisissez "Plus d'options..."** si nécessaire, puis **"Copier dans Archives SMS"** ou **"Ouvrir dans Safari"**
6. **Collez le fichier** dans la zone de dépôt ou utilisez le bouton "Importer XML"

### Installation sur l'écran d'accueil

1. Ouvrez Safari et rendez-vous sur [le lecteur Archive SMS](https://clement1211.github.io/archive-sms/app/)
2. Appuyez sur l'icône **Partager** (carré avec flèche vers le haut)
3. Faites défiler vers le bas et sélectionnez **"Sur l'écran d'accueil"**
4. Donnez un nom à l'application (ex: "Archives SMS")
5. Appuyez sur **Ajouter**

### ⚠️ Limites connues sur iOS

- **Stockage variable** : l’espace disponible dépend de l’appareil et des limites du navigateur. Gardez de l’espace libre pour l’import et le stockage de l’archive.
- **Conservation des données** : Le stockage peut être effacé si l'espace est insuffisant ou si vous supprimez l'application du cache.
- **Fichiers volumineux** : L'import de très grands fichiers peut prendre du temps et consommer beaucoup de mémoire.

**Recommandation** : Gardez toujours une copie de votre fichier XML d'origine comme sauvegarde principale.

## 📱 Créer une sauvegarde Android

Consultez le [guide pas à pas pour créer une sauvegarde XML avec SMS Backup & Restore](https://clement1211.github.io/archive-sms/guides/creer-sauvegarde-sms-android/). Il explique aussi comment transférer le fichier sur iPhone, Mac ou ordinateur et l’importer dans le lecteur.

## 🔒 Confidentialité

- **100% Local** : Aucune donnée ne quitte votre navigateur
- **Stockage** : Vos SMS sont sauvegardés dans IndexedDB sur cet appareil
- **Sécurité** : Les fichiers XML ne sont jamais envoyés vers un serveur
- **Suppression** : Utilisez le bouton « Supprimer » pour effacer toutes les données

## 🌐 Langues de l’interface

La langue se choisit dans **Réglages → Préférences** et reste mémorisée sur l’appareil. Au premier lancement, l’application suit la langue du navigateur si elle est prise en charge; sinon elle utilise le français.

Les textes sont regroupés dans le dossier `src/locales/`, avec un fichier par langue (`fr.js`, `en.js`). Pour ajouter une langue, créez son catalogue et ajoutez une entrée à la liste `languages` dans `src/i18n.js`; le sélecteur est généré à partir de cette liste. Gardez les mêmes clés dans chaque catalogue; toute traduction manquante retombe sur le français. Ajoutez aussi son fichier à la liste des ressources critiques de `sw.js` pour qu’il soit disponible hors ligne.

## 📁 Structure du projet

```
archive-sms/
├── index.md                # Page d’accueil publique (Jekyll)
├── _layouts/site.html      # Gabarit partagé des pages publiques
├── app/index.html          # Lecteur PWA
├── en/                     # Pages publiques en anglais
├── guides/                 # Guides pratiques en français
├── a-propos/               # Présentation du projet
├── confidentialite/        # Politique de confidentialité
├── contact/                # Contact et signalement
├── src/
│   ├── app.js               # Application principale
│   ├── i18n.js              # Gestion de la langue et des traductions
│   └── parser.js            # Parseur XML partagé
├── src/locales/
│   ├── fr.js                # Textes français
│   └── en.js                # Textes anglais
├── styles/
│   ├── styles.css           # Styles de l'application
│   └── site.css             # Styles des pages publiques
├── sw.js                   # Service Worker (PWA)
├── manifest.webmanifest    # Manifest PWA
├── favicon.svg             # Favicon SVG
├── assets/
│   ├── icon-192.png        # Icône PWA 192x192
│   ├── icon-512.png        # Icône PWA 512x512
│   ├── icon-maskable-192.png # Icône maskable 192x192
│   ├── icon-maskable-512.png # Icône maskable 512x512
│   └── apple-touch-icon.png # Icône Apple Touch 180x180
├── tests/
│   ├── extractor.test.js   # Tests d'extraction XML
│   ├── import.test.js      # Tests d'import et de stockage
│   ├── parser.test.js      # Tests du parseur
│   └── fixtures/
│       └── sample.xml      # Fichier XML de test
├── package.json            # Dépendances et commande de test
├── package-lock.json       # Versions verrouillées des dépendances
├── .gitignore              # Fichiers ignorés par Git
└── README.md               # Documentation
```

## 🔧 Configuration requise

- Aucun serveur requis pour l'utilisation en ligne (GitHub Pages)
- Pour le développement local : un serveur HTTP simple (pour le Service Worker)
- Navigateurs supportés : Chrome, Firefox, Edge, Safari (iOS)

## 📄 Licence

MIT © [Clement1211](https://github.com/Clement1211)
