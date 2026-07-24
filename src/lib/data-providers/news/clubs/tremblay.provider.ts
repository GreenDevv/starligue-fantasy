import { createWordpressNewsProvider } from "../wordpress.provider";

export const tremblayNewsProvider = createWordpressNewsProvider({
  sourceKey: "tremblay",
  siteUrl: "https://tremblayhandball.com",
  clubExternalSlug: "tremblay",
});
