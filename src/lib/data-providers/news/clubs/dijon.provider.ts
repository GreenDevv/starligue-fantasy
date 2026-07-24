import { createWordpressNewsProvider } from "../wordpress.provider";

export const dijonNewsProvider = createWordpressNewsProvider({
  sourceKey: "dijon",
  siteUrl: "https://dijon-metropole-handball.com",
  clubExternalSlug: "dijon",
});
