/** The value of one cookie from the request, or undefined. */
export function readCookie(request: Request, name: string): string | undefined {
  return request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

/** "; Secure" whenever the site is served over HTTPS, so a missing NODE_ENV cannot weaken a deployed cookie. */
export function secureFlag(): string {
  return process.env.NODE_ENV === "production" || process.env.FRONTEND_ORIGIN?.startsWith("https://") ? "; Secure" : "";
}
