# Consignes de travail — Archive SMS

## Repères du projet

- Le site public est construit avec Jekyll : la page d’accueil est `index.md`, les pages utilisent `_layouts/site.html` et leurs styles sont dans `styles/site.css`.
- Le lecteur PWA vit sous `app/`. Son code source est dans `src/`, son interface dans `styles/styles.css`, et son stockage local utilise IndexedDB.
- Le parseur XML partagé est `src/parser.js`. Les textes de l’application sont dans `src/locales/fr.js` et `src/locales/en.js`.
- Le site public a des URL françaises et anglaises distinctes. `_config.yml` définit actuellement `baseurl: /archive-sms`; `sitemap.txt` contient aussi des URL absolues.

## Avant toute modification

1. Vérifier `git status --short --branch`, `git log -5 --oneline` et les éventuels `AGENTS.md` plus proches des fichiers ciblés.
2. Lire les fichiers concernés et examiner les changements récents. Le dépôt peut avoir évolué depuis une tâche précédente.
3. Préserver tout changement déjà présent, même s’il n’est pas lié à la demande. Ne pas utiliser `git reset`, `git clean`, ni restaurer des fichiers sans autorisation explicite.

## Habitudes d’édition

- Faire des modifications ciblées et lisibles dans les fichiers concernés. Ne pas utiliser Python comme outil de modification ou de génération de fichiers; préférer un patch direct ou l’édition explicite du fichier.
- Garder les pages publiques, le lecteur et les données de l’utilisateur distincts. Ne pas déplacer la page d’accueil du site vers l’app ni changer le démarrage PWA sans raison liée à la demande.
- Pour les liens internes des pages Jekyll, utiliser `relative_url` afin de respecter `baseurl`. Éviter de coder en dur le préfixe `/archive-sms` dans les pages.
- Toute nouvelle page publique doit avoir un `permalink` propre, un titre et une description. Pour une page traduite, créer ou mettre à jour sa paire FR/EN, faire pointer les deux sélecteurs de langue l’un vers l’autre, et ajouter la page aux index pertinents et à `sitemap.txt`.
- Préserver les balises canoniques et `hreflang` gérées par `_layouts/site.html`. Vérifier la paire de langues après tout changement de route.
- La racine est le site d’accueil; `/app/` est le lecteur. Une ancienne PWA installée peut ouvrir la racine avant d’être redirigée vers le lecteur. Toute modification de ces chemins doit tenir compte de `manifest.webmanifest`, de l’enregistrement du service worker, de `sw.js` et de `tests/sw.test.js`.
- Si des ressources critiques hors ligne changent, vérifier la liste `CRITICAL_FILES` et faire évoluer `CACHE_VERSION` lorsque le cache doit être invalidé. Ne pas changer le cache pour une simple modification de contenu non mis en cache.
- Décrire le produit avec précision : Archive SMS permet de consulter une archive XML dans son propre lecteur; il ne réinjecte pas les messages dans l’app Messages d’Apple et ne récupère pas les messages sans sauvegarde. Les noms de contacts et les médias MMS dépendent du contenu de l’export.
- Garder l’apparence iOS actuelle, la navigation simple et le français/anglais cohérents. Ne pas ajouter de suivi, dépendance ou service externe sans nécessité pour la demande.

## Vérification

- Avant de conclure, contrôler `git diff --check` et relire le diff complet, y compris les nouveaux fichiers.
- Pour des changements de pages Jekyll, lancer `bundle exec jekyll build` si les dépendances sont installées; vérifier les URL générées sous le `baseurl` courant et ne jamais committer `_site/`.
- Le projet fournit `npm test` (`node --test tests/*.test.js`). Ne pas ajouter ni lancer des tests sans demande explicite de test ou de vérification. Si l’utilisateur demande une vérification des changements applicatifs, exécuter la suite existante et rapporter le résultat réel.
- Pour une publication demandée, vérifier les URL en ligne après le push et distinguer un déploiement encore en cours d’une erreur de build.

## Git et publication

- Garder les changements cohérents et les commits ciblés, avec un message clair, par exemple `feat: ...`, `fix: ...`, `content: ...` ou `chore: ...`.
- Inspecter `git status` et le diff avant d’ajouter des fichiers. Ne jamais inclure de sauvegardes SMS, XML privés, données locales, fichiers générés ou sorties de build.
- Ne pas committer ni pousser une tâche d’analyse seulement. Pour une demande d’implémentation destinée au site, respecter la préférence établie de l’utilisateur pour des commits propres et un site publié à jour, tant qu’il ne demande pas de garder les changements en local.
