import { createWordpressNewsProvider } from "../wordpress.provider";

export const saintRaphaelNewsProvider = createWordpressNewsProvider({
  sourceKey: "saint-raphael",
  siteUrl: "https://srvhb.com",
  clubExternalSlug: "saint-raphael",
});
