#!/bin/sh
set -e

# Xcode Cloud ne fait qu'un `git clone` du repo, jamais de `pnpm install` —
# or CapApp-SPM/Package.swift référence les plugins Capacitor via des chemins
# locaux vers node_modules/.pnpm/... (voir ARCHITECTURE.md §20.1), inexistants
# sur un clone frais. Ce script tourne automatiquement après le clone, avant
# la résolution des packages Swift, pour les peupler.
#
# Les images Xcode Cloud n'ont pas Node.js préinstallé (Homebrew si) — voir
# https://capgo.app/blog/how-to-build-capacitor-app-in-xcode-cloud/
cd "$CI_WORKSPACE"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js absent — installation via Homebrew"
  # pnpm 11.x exige Node >= 22.13 (utilise le module natif node:sqlite) —
  # node@20 (déprécié côté Homebrew de toute façon) fait planter corepack.
  brew install node@22
  brew link node@22 --force --overwrite
fi

node --version
corepack enable
corepack prepare pnpm@11.10.0 --activate
pnpm install --frozen-lockfile

# ios/App/App/public, capacitor.config.json, config.xml sont volontairement
# gitignorés (ios/.gitignore) — générés par `cap sync` avant chaque build en
# local, jamais commités. Sans cette étape, Xcode Cloud ne les trouve pas.
npx cap sync ios
