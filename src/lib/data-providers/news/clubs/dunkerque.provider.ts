import { createWordpressNewsProvider } from "../wordpress.provider";

export const dunkerqueNewsProvider = createWordpressNewsProvider({
  sourceKey: "dunkerque",
  siteUrl: "https://usdk.fr",
  clubExternalSlug: "dunkerque",
});
