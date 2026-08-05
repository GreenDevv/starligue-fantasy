#!/bin/sh
set -e

# Xcode Cloud ne fait qu'un `git clone` du repo, jamais de `pnpm install` —
# or CapApp-SPM/Package.swift référence les plugins Capacitor via des chemins
# locaux vers node_modules/.pnpm/... (voir ARCHITECTURE.md §20.1), inexistants
# sur un clone frais. Ce script tourne automatiquement après le clone, avant
# la résolution des packages Swift, pour les peupler.
cd "$CI_WORKSPACE"

corepack enable
corepack prepare pnpm@11.10.0 --activate
pnpm install --frozen-lockfile
