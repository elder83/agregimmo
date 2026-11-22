# agregimmo

Agrégateur d'annonces immobilières pour repérer **les biens rares et les opportunités d'investissement** dans une zone donnée.

![interface épurée : grille d'annonces, score d'opportunité, filtres](docs/apercu.png)

## Démarrer

```bash
npm start            # http://localhost:3000  (Node ≥ 20, aucune dépendance)
npm test             # tests unitaires
PORT=8080 npm start  # autre port
```

Au premier lancement, un **marché de démonstration** (agglomération nantaise, 4 portails fictifs) est généré pour tout tester. De nouvelles annonces, baisses de prix et ventes y apparaissent au fil des jours. Désactivez-le dans *Paramètres → Sources* une fois vos vraies sources branchées.

## Fonctionnalités

| | |
|---|---|
| **Recoupement multi-portails** | Une même annonce diffusée sur plusieurs sites (ou republiée) est regroupée en un seul bien : type, pièces, surface (±4 %), prix (±8 %), DPE, distance et similarité du texte. Vous voyez chaque diffusion, son prix et l'écart éventuel entre portails. |
| **Vraie ancienneté** | La date de mise en ligne retenue est la plus ancienne de toutes les diffusions : une annonce « remise en ligne » pour paraître neuve est signalée. |
| **Score d'opportunité (0–100)** | Prix au m² vs médiane locale, rareté (mots-clés + surfaces hors norme), baisse de prix, rendement locatif brut estimé, durée en vente, levier DPE F/G. Chaque point est expliqué dans la fiche. Pondérations et mots-clés réglables. |
| **Zone** | Centre (recherche de commune via la Base Adresse Nationale) + rayon en km, filtre par communes, vue carte. |
| **Tri** | Score, récence, ancienneté, prix, prix/m², décote, baisse, rendement, surface, distance. |
| **Filtres** | Type, prix, prix/m², surface, pièces, date de mise en ligne (24 h → > 90 j), score minimum, signaux (sous le marché, rare, baisse, rendement ≥ 7 %, multi-portails, remis en ligne, DPE F/G). |
| **Favoris** | Cœur sur chaque bien, statut (suivi → à visiter → visité → offre → écarté), notes, alerte si le prix baisse après l'ajout. |
| **Alertes** | Enregistrez une recherche : badge des nouveautés, notifications du navigateur. Actualisation automatique côté serveur. |
| **Ajout manuel / capture** | Collez un lien ou un texte d'annonce : prix, surface, pièces, ville, DPE… sont extraits puis recoupés. Le **bookmarklet** (Paramètres → Sources) envoie la page en cours depuis n'importe quel site. |
| **Flux RSS / Atom** | Branchez les flux d'alertes de portails, agences, notaires. |
| **Import / export** | CSV (titre, prix, surface, pieces, ville, code postal, lien…) ou JSON ; export des favoris et réglages. |
| **Interface** | Épurée, icônes au trait, thème clair/sombre, grille / liste / carte, fenêtres modales, responsive mobile. Raccourci `/` pour rechercher. |

## Sources : ce qui est fait et ce qui ne l'est pas

Les grands portails interdisent l'aspiration automatique de leurs pages dans leurs CGU et la bloquent techniquement. agregimmo ne les « scrape » donc pas : il agrège ce que vous pouvez légitimement récupérer (flux RSS, exports, alertes, capture manuelle de la page que vous consultez, API partenaires). Pour ajouter une source, créez un module dans `server/sources/` exposant `fetch({ settings })` qui renvoie des annonces au format :

```js
{ id, source, sourceLabel, url, title, description, type, price, surface, landSurface,
  rooms, bedrooms, dpe, city, postcode, lat, lng, photos, publishedAt }
```

puis déclarez-le dans `SOURCES` (`server/index.js`).

## Architecture

```
server/
  index.js      API HTTP + fichiers statiques, actualisation périodique
  store.js      persistance JSON (data/db.json)
  dedup.js      recoupement des annonces en biens
  score.js      score d'opportunité et signaux
  parse.js      extraction de champs depuis texte / HTML
  geo.js        distances, géocodage (api-adresse.data.gouv.fr)
  sources/      demo.js, rss.js
public/         interface (HTML/CSS/JS sans framework, Leaflet embarqué)
test/           tests node:test
```

## Pistes suivantes

- Prix de référence automatiques à partir des ventes réelles (DVF / data.gouv.fr).
- Bouton « ce n'est pas le même bien » pour corriger un regroupement.
- Comparaison de photos (hash perceptuel) pour un recoupement encore plus sûr.
- Envoi des alertes par e-mail ou Telegram.
