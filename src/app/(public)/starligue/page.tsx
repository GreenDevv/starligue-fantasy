import { redirect } from "next/navigation";

// /starligue est devenu la page d'accueil du site (voir src/app/page.tsx) — cette
// route ne sert plus qu'à rediriger d'éventuels anciens liens/favoris.
// /starligue/[id] (détail d'une actu) reste à son emplacement d'origine, inchangé.
export default function StarligueIndexRedirect() {
  redirect("/");
}
