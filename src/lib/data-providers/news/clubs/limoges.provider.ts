import { createWordpressNewsProvider } from "../wordpress.provider";

export const limogesNewsProvider = createWordpressNewsProvider({
  sourceKey: "limoges",
  siteUrl: "https://lh-handball.fr",
  clubExternalSlug: "limoges",
});
