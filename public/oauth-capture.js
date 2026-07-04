(function () {
  function captureParams(params) {
    if (!params) return false;
    var error = params.get("error");
    if (error) {
      var description = params.get("error_description");
      sessionStorage.setItem(
        "remember-when.oauth-error",
        description ? description.replace(/\+/g, " ") : error.replace(/_/g, " ")
      );
      return true;
    }
    var accessToken = params.get("access_token");
    if (accessToken) {
      sessionStorage.setItem("remember-when.auth-token", accessToken);
      sessionStorage.setItem("remember-when.oauth-return", "1");
      sessionStorage.removeItem("remember-when.oauth-code");
      var secure = window.location.protocol === "https:" ? "; Secure" : "";
      if (accessToken.length < 3500) {
        document.cookie =
          "nf_jwt=" + encodeURIComponent(accessToken) + "; Path=/; SameSite=Lax" + secure;
      }
      var refresh = params.get("refresh_token");
      if (refresh && refresh.length < 3500) {
        document.cookie =
          "nf_refresh=" + encodeURIComponent(refresh) + "; Path=/; SameSite=Lax" + secure;
      }
      return true;
    }
    var code = params.get("code");
    if (code) {
      sessionStorage.setItem("remember-when.oauth-code", code);
      sessionStorage.setItem("remember-when.oauth-return", "1");
      return true;
    }
    return false;
  }

  var hash = window.location.hash.replace(/^#/, "");
  var query = window.location.search.replace(/^\?/, "");
  var captured = captureParams(hash ? new URLSearchParams(hash) : null);
  if (!captured && query) {
    captured = captureParams(new URLSearchParams(query));
  }
  if (captured || hash || query) {
    history.replaceState(null, "", window.location.pathname);
  }
})();
