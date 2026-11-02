# Carte ruralité AURA – DAHLIR

Carte interactive en HTML/JavaScript, 100 % open source (Leaflet, MarkerCluster, PapaParse, fonds de carte OpenStreetMap/CARTO), sans serveur ni base de données : un simple hébergement de fichiers statiques suffit.

Elle affiche :
- les communes en **FRR** et **FRR+** (France Ruralités Revitalisation, qui a remplacé les ZRR le 1er juillet 2024) ;
- les **QPV** (quartiers prioritaires de la politique de la ville, géographie 2024) ;
- les **actions du DAHLIR**, avec calcul automatique de leur localisation : en FRR, FRR+, en QPV ou hors zonage. On peut filtrer pour ne voir que les actions situées dans ces zones, par type, département ou mot-clé, et exporter la sélection en CSV.

## Structure

```
carte-dahlir/
├── index.html              page + styles
├── app.js                  logique de la carte
├── data/
│   ├── actions_dahlir.csv  VOS actions (le fichier fourni ne contient que des exemples fictifs)
│   ├── frr_aura.geojson    généré par le script
│   └── qpv_aura.geojson    généré par le script
└── scripts/prepare_data.py préparation des données officielles
```

## 1. Préparer les données de zonage

```bash
pip install requests pandas openpyxl
python scripts/prepare_data.py
```

Le script télécharge la liste FRR (data.gouv.fr / DGCL), les contours communaux (geo.api.gouv.fr) et les QPV (ANCT), puis ne garde que les 12 départements d'AURA.

Points d'attention :
- **FRR+** : le niveau renforcé est fixé par l'arrêté du 9 juillet 2025. Si la liste FRR téléchargée ne l'indique pas, récupérez la liste FRR+ sur collectivites-locales.gouv.fr et passez-la avec `--frr-plus-file`. Sans cela, toutes les communes sont affichées en « FRR ».
- Si un téléchargement automatique échoue (les fichiers officiels changent de nom ou de format), téléchargez-les à la main et utilisez `--frr-file`, `--qpv-file`.
- Vérifiez que la liste FRR utilisée est la plus récente : le zonage a été ajusté en 2025 (arrêtés des 14 avril et 9 juillet 2025) et peut évoluer.
- Les QPV doivent être en WGS84 (EPSG:4326). Sinon : `ogr2ogr -f GeoJSON -t_srs EPSG:4326 sortie.geojson entree.geojson`.

## 2. Renseigner les actions du DAHLIR

Éditez `data/actions_dahlir.csv` (Excel ou LibreOffice, enregistrer en CSV UTF-8) :

| colonne | rôle |
|---|---|
| `id`, `titre`, `type` | identifiant, intitulé, catégorie (alimente le filtre) |
| `commune`, `code_insee` | le code INSEE permet de savoir si l'action est en FRR/FRR+ |
| `lat`, `lon` | coordonnées WGS84 (le point détermine l'appartenance à un QPV) |
| `date`, `statut`, `partenaires`, `description`, `lien` | affichés dans la fenêtre de l'action |

Les coordonnées peuvent être obtenues en géocodant vos adresses avec la Base Adresse Nationale (https://adresse.data.gouv.fr/csv, outil gratuit de géocodage de fichier CSV).

## 3. Tester en local

```bash
python -m http.server 8000
```
puis ouvrir http://localhost:8000 (un simple double-clic sur `index.html` ne marche pas : le navigateur bloque la lecture des fichiers de données).

## 4. Publier

Copiez le dossier sur n'importe quel hébergement statique : GitHub Pages, GitLab Pages, ou le serveur web de votre structure. Si le fichier d'actions contient des données non publiques, hébergez la carte en interne plutôt que sur un site ouvert.

Pour fonctionner hors ligne ou sans CDN, téléchargez Leaflet, MarkerCluster et PapaParse dans un dossier `lib/` et modifiez les balises `<link>`/`<script>` de `index.html`.

## Licences des composants

Leaflet (BSD-2), Leaflet.markercluster (MIT), PapaParse (MIT), données : licence ouverte Etalab (data.gouv.fr), fonds de carte © contributeurs OpenStreetMap, © CARTO.
