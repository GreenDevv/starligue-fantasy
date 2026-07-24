import { createWordpressNewsProvider } from "../wordpress.provider";

export const saranNewsProvider = createWordpressNewsProvider({
  sourceKey: "saran",
  siteUrl: "https://septors.fr",
  clubExternalSlug: "saran",
});
