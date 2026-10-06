export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const startLogin = () => {
  if (typeof window !== "undefined") window.location.href = "/sign-in";
};
