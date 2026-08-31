# 🔍 Instagram Unfollow Tracker Pro

Extension Chrome/Firefox 100% gratuite et open-source pour identifier et gerer les comptes Instagram qui ne vous suivent pas en retour, avec dashboard complet, historique, auto-pilot securise et whitelist.

> ⚠️ **Avertissement** : L'automatisation d'actions sur Instagram viole ses conditions d'utilisation. Cet outil integre des limites de securite strictes (max 15 desabonnements/heure, delais aleatoires humains) mais reste utilise a vos risques. Ne l'utilisez pas de facon excessive.

## ✨ Fonctionnalites

- **Dashboard plein ecran** avec recherche, tri et filtres
- **Historique persistant** (IndexedDB) avec graphique d'evolution de vos abonnements/abonnes/non-followers
- **Auto-pilot securise** : file d'attente qui tourne en tache de fond en respectant la limite horaire, avec notifications desktop a chaque action
- **Whitelist** pour proteger certains comptes de tout desabonnement automatique
- **Export CSV / JSON** de la liste des non-followers
- **Statistiques en direct** : nombre d'abonnements, d'abonnes, de non-followers, compteur de rate-limit

## 🚀 Installation

### Chrome / Edge / Brave

1. Telechargez ou clonez ce repo
2. Ouvrez `chrome://extensions`
3. Activez le **Mode developpeur** (en haut a droite)
4. Cliquez sur **Charger l'extension non empaquetee**
5. Selectionnez le dossier du projet

### Firefox

1. Ouvrez `about:debugging#/runtime/this-firefox`
2. Cliquez sur **Charger un module temporaire**
3. Selectionnez le fichier `manifest.json`

## ▶️ Utilisation

1. Connectez-vous sur [instagram.com](https://www.instagram.com) dans le meme navigateur
2. Cliquez sur l'icone de l'extension puis **Ouvrir le Dashboard**
3. Entrez votre `@username` et cliquez sur **Scanner**
4. La liste des non-followers s'affiche avec photo, lien direct et bouton de desabonnement
5. Utilisez la **whitelist** pour proteger des comptes, puis lancez l'**auto-pilot** sur la selection restante si vous voulez un traitement automatise et etale dans le temps

## 🛡️ Securite integree

| Mecanisme | Valeur |
|---|---|
| Max desabonnements / heure | 15 |
| Delai aleatoire entre requetes | 2 a 5 secondes (gaussien) |
| Auto-pilot : lots par cycle | 3 profils toutes les 5 minutes |
| Source des donnees | Session active du navigateur (cookies), aucune API tierce |
| Stockage | 100% local (IndexedDB), rien n'est envoye a un serveur externe |

## 📁 Architecture

```
instagram-unfollow-pro/
├── manifest.json        Manifeste MV3
├── background.js        Service worker : auto-pilot, notifications, alarms
├── db.js                 Wrapper IndexedDB (profils, historique, whitelist, file)
├── ig-api.js             Appels reseau Instagram + delais humains
├── dashboard.html/css/js Interface principale plein ecran
├── popup.html/css/js     Popup rapide de la barre d'outils
└── README.md
```

## 🤝 Contribuer

Projet open-source, les pull requests sont bienvenues (ameliorations UI, detection anti-ban plus fine, i18n, etc.).

## 📄 Licence

MIT — voir le fichier `LICENSE`.
