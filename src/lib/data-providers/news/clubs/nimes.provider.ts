import { createWordpressNewsProvider } from "../wordpress.provider";

export const nimesNewsProvider = createWordpressNewsProvider({
  sourceKey: "nimes",
  siteUrl: "https://usam-nimesgard.fr",
  clubExternalSlug: "nimes",
});
