import { createWordpressNewsProvider } from "../wordpress.provider";

export const istresNewsProvider = createWordpressNewsProvider({
  sourceKey: "istres",
  siteUrl: "https://istreshandball.com",
  clubExternalSlug: "istres",
});
