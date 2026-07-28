import { redirect } from "@/i18n/navigation";

// /starligue est devenu la page d'accueil du site (voir src/app/[locale]/page.tsx) —
// cette route ne sert plus qu'à rediriger d'éventuels anciens liens/favoris.
// /starligue/[id] (détail d'une actu) reste à son emplacement d'origine, inchangé.
export default function StarligueIndexRedirect({ params }: { params: { locale: string } }) {
  redirect({ href: "/", locale: params.locale });
}
