/** Remove credentials before any render, network request, or asynchronous work. */
export function consumeOAuthReturn(
  location: Pick<Location, "hash" | "pathname" | "search">,
  history: Pick<History, "replaceState">,
) {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const access = params.get("access_token");
  const refresh = params.get("refresh_token");
  if (["access_token", "refresh_token", "provider_token", "provider_refresh_token"].some(key => params.has(key))) {
    history.replaceState(null, "", location.pathname + location.search);
  }
  return access && refresh ? { access_token: access, refresh_token: refresh } : null;
}
