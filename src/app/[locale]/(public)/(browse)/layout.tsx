// Reproduit exactement le <main> que fournissait (game)/layout.tsx pour ces
// pages avant leur passage en mode Starligue (public) — clubs/matches/players
// n'ont pas de conteneur propre, ils dépendent entièrement de ce wrapper.
export default function BrowseLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-2xl px-4 py-6 pb-6">{children}</main>;
}
