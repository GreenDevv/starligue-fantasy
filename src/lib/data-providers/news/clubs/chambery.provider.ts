import { createWordpressNewsProvider } from "../wordpress.provider";

export const chamberyNewsProvider = createWordpressNewsProvider({
  sourceKey: "chambery",
  siteUrl: "https://teamchambe.com",
  clubExternalSlug: "chambery",
});
