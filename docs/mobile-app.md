# App mobile iOS/Android — checklist de publication

Voir `ARCHITECTURE.md` §20 pour l'architecture (shell Capacitor "live URL" +
notifications push). Ce document liste uniquement les étapes qui nécessitent
un compte/outil externe et ne peuvent pas être scriptées.

## 1. Comptes développeur

- [ ] **Apple Developer Program** (99$/an) — https://developer.apple.com/programs/
      Une fois inscrit : App Store Connect → créer un nouvel app record avec le
      bundle ID `fr.starliguefantasy.app`.
- [ ] **Google Play Console** (25$ one-time) — https://play.google.com/console/
      Créer l'app avec le package name `fr.starliguefantasy.app`.

## 2. Firebase (Android uniquement — voir §2bis pour iOS)

⚠️ Le plan initial prévoyait Firebase Cloud Messaging comme backend unique
pour les deux plateformes. Abandonné pour iOS : `@capacitor/push-notifications`
restitue le token APNs brut, pas un jeton FCM, inutilisable par Firebase sans
ajouter son SDK natif au projet Xcode — voir ARCHITECTURE.md §20.2. Firebase
ne sert donc plus qu'à l'envoi Android.

- [x] Créer un projet Firebase — https://console.firebase.google.com/
- [ ] Ajouter l'app Android (`fr.starliguefantasy.app`) → télécharger
      `google-services.json` → le placer dans `android/app/google-services.json`.
- [x] Générer une clé de compte de service Firebase (Project settings →
      Service accounts → Generate new private key) → poser son contenu JSON
      dans la variable d'env Railway `FIREBASE_SERVICE_ACCOUNT_JSON` (utilisée
      par `src/lib/push/send-push-client.ts` pour Android).
- [ ] L'app iOS ajoutée dans Firebase (`GoogleService-Info.plist`) et la clé
      APNs uploadée dans Firebase Cloud Messaging config sont désormais
      **inutiles pour l'envoi** (on ne passe plus par Firebase côté iOS) —
      laissées en place, sans impact, pas la peine de les retirer.

## 2bis. APNs direct (iOS)

- [x] Apple Developer → Certificates, Identifiers & Profiles → **Keys** → créer
      une clé APNs **Environment: Sandbox** (pour les builds Xcode debug) —
      télécharger le `.p8` immédiatement (téléchargement unique), noter le Key ID.
- [ ] Même chose en **Environment: Production** (pour TestFlight/App Store) —
      clé physiquement différente, Key ID différent, `.p8` différent.
- [ ] Poser sur Railway (variables du service `web`) :
      - `APNS_TEAM_ID` — Team ID du compte Apple Developer
      - `APNS_KEY_ID` — Key ID de la clé active
      - `APNS_AUTH_KEY` — contenu complet du `.p8` actif (coller tel quel,
        avec les retours à la ligne)
      - `APNS_PRODUCTION` — `false` tant que seul Xcode debug est utilisé,
        `true` une fois en TestFlight/App Store (bascule globale, voir
        ARCHITECTURE.md §20.2 pour la limite de cette approche)
- [ ] Au passage en TestFlight/App Store : remplacer `APNS_KEY_ID`/`APNS_AUTH_KEY`
      par la clé Production et passer `APNS_PRODUCTION=true`.

## 3. Xcode (ios/App/App.xcodeproj)

- [x] Ouvrir `ios/App/App.xcodeproj` (Capacitor 7.x utilise Swift Package
      Manager, pas CocoaPods — pas de `.xcworkspace` généré).
- [x] Signing & Capabilities → sélectionner l'équipe de signature (compte
      Apple Developer), device physique enregistré.
- [x] Ajouter la capability **Push Notifications**.
- [x] Ajouter la capability **Background Modes** → cocher "Remote
      notifications".
- [x] Build + run sur un **device physique** (le simulateur iOS ne reçoit
      jamais de vraies notifications APNs) — testé et confirmé fonctionnel
      le 2026-08-05 (push direct APNs).

## 4. Android Studio (android/)

- [ ] Ouvrir le dossier `android/` dans Android Studio, laisser Gradle
      synchroniser.
- [ ] Vérifier que `google-services.json` est bien dans `android/app/`.
- [ ] Build sur émulateur ou device.

## 5. Soumission stores

- [ ] Captures d'écran (plusieurs formats requis par Apple : 6.7", 6.5",
      5.5" ; Google : téléphone + tablette si applicable).
- [ ] Description, mots-clés, catégorie ("Sports").
- [ ] Politique de confidentialité : `https://starliguefantasy.fr/confidentialite`
      (déjà en ligne).
- [ ] Fiche de confidentialité des données (App Store "Privacy Nutrition
      Label" / Play "Data safety") : déclarer la collecte d'email (compte),
      et le token push (identifiant device) — pas de tracking publicitaire
      (cf. bandeau cookies existant, purement informatif).
- [ ] iOS : soumettre d'abord en interne via **TestFlight** avant la review
      publique.
- [ ] Android : commencer par une piste de test interne dans Play Console
      avant la publication en production.

## Rappel — risque de rejet Apple (guideline 4.2)

L'app charge le site en direct dans une WebView. Pour éviter un rejet "juste
un site web dans une coquille", elle doit apporter une vraie valeur native :
les notifications push (deadlines, résultats) en sont l'argument principal.
Mentionner explicitement ce point dans les notes de review App Store Connect
si l'app est mise en attente pour ce motif.
