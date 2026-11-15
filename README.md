# Archives SMS

> Une application web progressive (PWA) pour lire localement vos exports XML de **SMS Backup & Restore**.

## ✨ Fonctionnalités

- **Import d'un fichier XML** depuis SMS Backup & Restore
- **Liste des conversations** avec recherche
- **Affichage des SMS/MMS** et des pièces jointes
- **Stockage local** dans IndexedDB (sur l'appareil)
- **PWA Installable** sur écran d'accueil
- **Mode hors ligne** après premier chargement
- **Interface responsive** adaptée mobile/desktop

## 📱 Installation

### Utilisation en ligne
Rendez-vous sur : [https://clement1211.github.io/archive-sms](https://clement1211.github.io/archive-sms)

### Installation locale

1. Clonez ce dépôt :
   ```bash
   git clone https://github.com/Clement1211/archive-sms.git
   cd archive-sms
   ```

2. Lancez un serveur local (nécessaire pour le Service Worker) :
   ```bash
   python3 -m http.server 8000
   ```

3. Ouvrez votre navigateur à l'adresse : [http://localhost:8000](http://localhost:8000)

## 📱 Utilisation sur iPhone

### Import depuis l'app Fichiers

1. **Transférez votre fichier XML** sur votre iPhone (par AirDrop, iCloud Drive, email, etc.)
2. **Ouvrez l'app Fichiers** sur votre iPhone
3. **Trouvez votre fichier XML** (dans iCloud Drive, Mes fichiers, ou une autre source)
4. **Appuyez et maintenez** sur le fichier, puis sélectionnez **"Partager"**
5. **Choisissez "Plus d'options..."** si nécessaire, puis **"Copier dans Archives SMS"** ou **"Ouvrir dans Safari"**
6. **Collez le fichier** dans la zone de dépôt ou utilisez le bouton "Importer XML"

### Installation sur l'écran d'accueil

1. Ouvrez Safari et rendez-vous sur [https://clement1211.github.io/archive-sms](https://clement1211.github.io/archive-sms)
2. Appuyez sur l'icône **Partager** (carré avec flèche vers le haut)
3. Faites défiler vers le bas et sélectionnez **"Sur l'écran d'accueil"**
4. Donnez un nom à l'application (ex: "Archives SMS")
5. Appuyez sur **Ajouter**

### ⚠️ Limites connues sur iOS

- **Stockage limité** : Safari iOS impose une limite de stockage (généralement ~500 Mo - 1 Go) pour les IndexedDB. Les fichiers XML de 230 Mo peuvent atteindre cette limite.
- **Conservation des données** : Le stockage peut être effacé si l'espace est insuffisant ou si vous supprimez l'application du cache.
- **Fichiers volumineux** : L'import de très grands fichiers peut prendre du temps et consommer beaucoup de mémoire.

**Recommandation** : Gardez toujours une copie de votre fichier XML d'origine comme sauvegarde principale.

## 📱 Comment exporter vos SMS depuis Android

1. **Installez SMS Backup & Restore** depuis le [Google Play Store](https://play.google.com/store/apps/details?id=com.riteshsahu.SMSBackupRestore)
2. **Ouvrez l'application** et autorisez les permissions de lecture des SMS
3. **Créez une sauvegarde** :
   - Cliquez sur "Sauvegarder" ou "Backup"
   - Choisissez le format **XML** (pas JSON)
   - Sélectionnez les conversations à exporter (ou "Tout")
   - Lancez la sauvegarde
4. **Trouvez votre fichier** dans `/SMS Backup Restore/` sur votre stockage
5. **Transférez le fichier** vers votre ordinateur/appareil
6. **Importez-le** dans Archives SMS depuis le bouton "Importer XML"

## 🔒 Confidentialité

- **100% Local** : Aucune donnée ne quitte votre navigateur
- **Stockage** : Vos SMS sont sauvegardés dans IndexedDB sur cet appareil
- **Sécurité** : Les fichiers XML ne sont jamais envoyés vers un serveur
- **Suppression** : Utilisez le bouton "Effacer" pour supprimer toutes les données

## 📁 Structure du projet

```
archive-sms/
├── index.html              # Page principale
├── src/
│   ├── app.js               # Application principale
│   └── parser.js            # Parseur XML partagé
├── styles/
│   └── styles.css           # Styles de l'application
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
