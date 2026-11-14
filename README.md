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

## 📄 Licence

MIT © [Clement1211](https://github.com/Clement1211)
