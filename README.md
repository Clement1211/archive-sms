# Archives SMS

Petite web-app/PWA pour lire localement un export XML de **SMS Backup & Restore**.

## Fonctions
- Import d'un fichier XML depuis Fichiers / Google Drive.
- Liste des conversations, recherche dans les contacts et messages.
- Affichage des SMS/MMS et des images jointes présentes dans le XML.
- Stockage des messages dans IndexedDB, sur l'appareil.
- Interface adaptée aux écrans iPhone et mode hors ligne après le premier chargement.

## Lancer en local
Un navigateur bloque parfois les Service Workers sur `file://`. Lance plutôt un petit serveur local :
```bash
python3 -m http.server 8000
```
Puis ouvre `http://localhost:8000`.

## Publier sur GitHub Pages
1. Crée un dépôt GitHub (par exemple `archives-sms`).
2. Ajoute tous les fichiers de ce dossier à la racine du dépôt.
3. Dans **Settings → Pages**, choisis **Deploy from a branch**, branche `main`, dossier `/ (root)`.
4. Ouvre l'URL GitHub Pages obtenue sur l'iPhone.
5. Dans Safari : **Partager → Sur l'écran d'accueil**.

## Vie privée et limites
- L'analyse XML et le stockage des messages sont faits dans le navigateur. Aucun serveur applicatif n'est utilisé par ce projet.
- Le stockage du navigateur peut être supprimé par iOS, notamment si les données du site sont effacées. Conserve toujours l'export XML original.
- La structure des exports MMS varie. Les images incluses comme données base64 sont prises en charge ; les pièces jointes référencées uniquement par un chemin externe ne peuvent pas être retrouvées automatiquement.
- L'export JSON est une copie des messages sans pièces jointes binaires. Le XML d'origine reste la sauvegarde complète à conserver.
- Ce projet n'est pas une application native iOS distribuée via l'App Store.
