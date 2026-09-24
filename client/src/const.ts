export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/** Local-first authentication entry point. Firestore/OAuth can replace this adapter later. */
export const startLogin = () => {
  if (typeof window !== "undefined") window.location.href = "/sign-in";
};
