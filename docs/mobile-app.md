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

## 2. Firebase (push notifications unifiées iOS + Android)

- [ ] Créer un projet Firebase — https://console.firebase.google.com/
- [ ] Ajouter l'app Android (`fr.starliguefantasy.app`) → télécharger
      `google-services.json` → le placer dans `android/app/google-services.json`.
- [ ] Ajouter l'app iOS (`fr.starliguefantasy.app`) → télécharger
      `GoogleService-Info.plist` → l'ajouter au projet **via Xcode**
      (glisser-déposer dans le navigateur de fichiers avec "Copy items if
      needed" coché — un simple copier dans le dossier ne suffit pas, le
      fichier doit être ajouté à la target `App`).
- [ ] Générer une **clé d'authentification APNs** dans le compte Apple
      Developer (Certificates, Identifiers & Profiles → Keys) et l'uploader
      dans Firebase (Project settings → Cloud Messaging → Apple app
      configuration).
- [ ] Générer une clé de compte de service Firebase (Project settings →
      Service accounts → Generate new private key) → poser son contenu JSON
      dans la variable d'env Railway `FIREBASE_SERVICE_ACCOUNT_JSON` (utilisée
      par `src/lib/push/send-push-client.ts`).

## 3. Xcode (ios/App/App.xcworkspace)

- [ ] Ouvrir `ios/App/App.xcworkspace` (pas le `.xcodeproj`).
- [ ] Signing & Capabilities → sélectionner l'équipe de signature (compte
      Apple Developer).
- [ ] Ajouter la capability **Push Notifications**.
- [ ] Ajouter la capability **Background Modes** → cocher "Remote
      notifications".
- [ ] Vérifier que `GoogleService-Info.plist` apparaît dans le navigateur de
      fichiers Xcode (pas seulement sur le disque, cf. §2).
- [ ] Build sur un **device physique** pour tester le push (le simulateur
      iOS ne reçoit pas de vraies notifications APNs).

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
