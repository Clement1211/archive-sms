# Archives SMS

> Une application web progressive (PWA) pour lire localement vos exports XML de **SMS Backup & Restore**.

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Online-brightgreen)](https://clement1211.github.io/archive-sms)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PWA](https://img.shields.io/badge/PWA-Ready-blue)](https://web.dev/progressive-web-apps/)

## 📸 Capture d'écran

![Archives SMS Screenshot](https://clement1211.github.io/archive-sms/assets/icons/icon-512.png)
*(Capture à ajouter plus tard)*

## ✨ Fonctionnalités

- **Import XML** : Chargez vos fichiers d'export depuis SMS Backup & Restore
- **Liste des conversations** : Visualisez toutes vos discussions par contact
- **Recherche** : Trouvez facilement des messages ou contacts
- **Affichage des SMS/MMS** : Lisez vos messages avec les pièces jointes
- **Stockage local** : Toutes vos données restent sur votre appareil (IndexedDB)
- **PWA Installable** : Installez l'application sur votre écran d'accueil
- **Mode hors ligne** : Fonctionne sans connexion internet après la première visite
- **Responsive Design** : Adapté aux mobiles, tablettes et ordinateurs

## 🚀 Installation

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

## 📱 Comment exporter vos SMS depuis Android

1. **Installez SMS Backup & Restore** depuis le [Google Play Store](https://play.google.com/store/apps/details?id=com.riteshsahu.SMSBackupRestore)
2. **Ouvrez l'application** et autorisez les permissions
3. **Créez une sauvegarde** :
   - Cliquez sur "Sauvegarder" ou "Backup"
   - Choisissez le format **XML** (pas JSON)
   - Sélectionnez les conversations à exporter
   - Lancez la sauvegarde
4. **Trouvez votre fichier** dans `/SMS Backup Restore/`
5. **Transférez le fichier** vers votre ordinateur/appareil
6. **Importez-le** dans Archives SMS

## 💰 Monétisation

Ce projet utilise **Carbon Ads** pour la monétisation. Les publicités sont discrètes et respectueuses de l'expérience utilisateur.

Pour activer AdSense (nécessite un domaine personnalisé) :
1. Obtenez un domaine via [GitHub Student Pack](https://education.github.com/pack) (gratuit pour les étudiants)
2. Configurez le CNAME dans GitHub Pages
3. Ajoutez votre code AdSense dans le projet

## 🔧 Développement

### Structure du projet
```
archive-sms/
├── index.html          # Page principale
├── app.js             # Logique de l'application
├── styles.css         # Styles CSS
├── manifest.webmanifest # Configuration PWA
├── sw.js              # Service Worker
├── CNAME              # Pour le domaine personnalisé
├── favicon.svg        # Favicon
├── .gitignore         # Fichiers exclus
└── assets/
    └── icons/         # Icônes PWA
        ├── icon.svg
        └── README.md  # Instructions pour les icônes
```

### Technologies utilisées
- **Vanilla JavaScript** (ES6+)
- **IndexedDB** pour le stockage local
- **Service Worker** pour le mode hors ligne
- **CSS3** avec animations et responsive design

### Améliorations possibles
- [ ] Ajouter des icônes PNG pour une meilleure compatibilité PWA
- [ ] Implémenter un système de tags/catégories pour les conversations
- [ ] Ajouter un mode sombre
- [ ] Implémenter l'export au format PDF
- [ ] Ajouter un système de recherche avancée (dates, mots-clés)

## 🤝 Contribution

Les contributions sont les bienvenues ! Ouvrez une issue ou proposez une pull request.

## 📄 Licence

MIT © [Clement1211](https://github.com/Clement1211)

## 🙏 Remerciements

- [SMS Backup & Restore](https://play.google.com/store/apps/details?id=com.riteshsahu.SMSBackupRestore) pour le format XML
- [GitHub Pages](https://pages.github.com/) pour l'hébergement gratuit
- [Carbon Ads](https://carbonads.net/) pour la monétisation

---

**⚠️ Important** : Aucune donnée n'est envoyée vers un serveur. Toutes vos données restent **100% locales** sur votre appareil.
