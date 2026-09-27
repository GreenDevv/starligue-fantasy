// Rapprochement joueur lnh.fr → Player. Fonctions pures.
//
// Identifiant stable = slug du profil lnh.fr (`…/joueurs/<slug>`), stocké dans
// Player.externalIds.lnh_slug. Un nom ne suffit pas : lnh.fr renomme des joueurs en
// cours de saison (« MONTE DOS SANTOS Hugo » devenu « MONTE Bryan » après J2, ses
// notes n'étaient plus rapprochées) et les accents/découpes varient (« André » vs
// « Andre », « GARCIANDIA A. Imanol »). Le boxscore définitif et la liste officielle
// des joueurs portent le slug ; le tableau de stats du flux live, lui, n'a que le
// nom → on garde aussi le DERNIER nom affiché par lnh.fr (externalIds.lnh_name),
// rafraîchi à chaque ingestion définitive, pour que le live suive les renommages.
//
// Ordre de résolution : slug → dernier nom lnh.fr + club → notre nom + club.

export interface LnhResolvablePlayer {
  id: string;
  firstName: string;
  lastName: string;
  clubId: string;
  externalIds: unknown;
}

export interface LnhPlayerRef {
  slug: string | null;
  lastName: string;
  firstName: string;
  clubId: string | null;
}

export interface LnhPlayerIdentity {
  lnh_slug?: string;
  lnh_name?: string;
}

export type LnhMatchMethod = "slug" | "lnh_name" | "name";

export interface LnhPlayerIndex {
  bySlug: Map<string, string>;
  byLnhName: Map<string, string>;
  byName: Map<string, string>;
}

// Nom complet sans accents, casse ni ponctuation, indépendant de la découpe
// nom/prénom (« GARCIANDIA A. Imanol » = GARCIANDIA A. / Imanol = GARCIANDIA / A. Imanol).
export function lnhNameKey(lastName: string, firstName: string): string {
  return `${lastName} ${firstName}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Dernier segment d'une URL de profil lnh.fr, quelle que soit sa forme :
// « lnh/joueurs/x », « daikin-starligue/joueurs/x », « https://…/api/daikin-starligue/joueurs/x ».
export function lnhSlugFromProfileUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/?joueurs\/([a-z0-9-]+)\/?(?:[?#].*)?$/i);
  return m ? m[1]!.toLowerCase() : null;
}

export function readLnhIdentity(externalIds: unknown): LnhPlayerIdentity {
  if (!externalIds || typeof externalIds !== "object") return {};
  const ids = externalIds as Record<string, unknown>;
  return {
    ...(typeof ids.lnh_slug === "string" ? { lnh_slug: ids.lnh_slug } : {}),
    ...(typeof ids.lnh_name === "string" ? { lnh_name: ids.lnh_name } : {}),
  };
}

function clubScoped(key: string, clubId: string): string {
  return `${key}|${clubId}`;
}

export function buildLnhPlayerIndex(players: LnhResolvablePlayer[]): LnhPlayerIndex {
  const index: LnhPlayerIndex = { bySlug: new Map(), byLnhName: new Map(), byName: new Map() };
  for (const p of players) {
    const ident = readLnhIdentity(p.externalIds);
    if (ident.lnh_slug) index.bySlug.set(ident.lnh_slug, p.id);
    // lnh_name stocké tel que la clé normalisée (voir lnhIdentityPatch)
    if (ident.lnh_name) index.byLnhName.set(clubScoped(ident.lnh_name, p.clubId), p.id);
    index.byName.set(clubScoped(lnhNameKey(p.lastName, p.firstName), p.clubId), p.id);
  }
  return index;
}

export function resolveLnhPlayer(
  index: LnhPlayerIndex,
  ref: LnhPlayerRef
): { playerId: string; method: LnhMatchMethod } | null {
  if (ref.slug) {
    const id = index.bySlug.get(ref.slug.toLowerCase());
    if (id) return { playerId: id, method: "slug" };
  }
  if (!ref.clubId) return null;
  const key = clubScoped(lnhNameKey(ref.lastName, ref.firstName), ref.clubId);
  const byLnh = index.byLnhName.get(key);
  if (byLnh) return { playerId: byLnh, method: "lnh_name" };
  const byName = index.byName.get(key);
  if (byName) return { playerId: byName, method: "name" };
  return null;
}

// Mise à jour d'externalIds à persister après un rapprochement (null = rien à
// écrire). N'écrase jamais un slug existant par un autre : un conflit de slug est
// signalé par `conflict` et laissé à l'humain.
export function lnhIdentityPatch(
  currentExternalIds: unknown,
  seen: { slug: string | null; lastName: string; firstName: string }
): { externalIds: Record<string, unknown>; conflict: boolean } | null {
  const current =
    currentExternalIds && typeof currentExternalIds === "object"
      ? (currentExternalIds as Record<string, unknown>)
      : {};
  const ident = readLnhIdentity(current);
  const slug = seen.slug?.toLowerCase() ?? null;
  const name = lnhNameKey(seen.lastName, seen.firstName);

  if (slug && ident.lnh_slug && ident.lnh_slug !== slug) {
    return { externalIds: current, conflict: true };
  }
  const next: Record<string, unknown> = { ...current };
  if (slug && !ident.lnh_slug) next.lnh_slug = slug;
  if (ident.lnh_name !== name) next.lnh_name = name;
  if (next.lnh_slug === current.lnh_slug && next.lnh_name === current.lnh_name) return null;
  return { externalIds: next, conflict: false };
}
