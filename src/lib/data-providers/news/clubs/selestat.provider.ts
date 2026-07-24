import { createWordpressNewsProvider } from "../wordpress.provider";

export const selestatNewsProvider = createWordpressNewsProvider({
  sourceKey: "selestat",
  siteUrl: "https://sa-hb.com",
  clubExternalSlug: "selestat",
});
