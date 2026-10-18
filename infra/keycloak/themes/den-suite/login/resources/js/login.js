(() => {
  const initializeLogin = () => {
    const form = document.getElementById("kc-form-login");
    const redirectUri = new URLSearchParams(window.location.search).get("redirect_uri");
    if (!form || !redirectUri) {
      return;
    }

    let appOrigin;
    try {
      const parsedRedirect = new URL(redirectUri);
      if (parsedRedirect.protocol !== "http:" && parsedRedirect.protocol !== "https:") {
        return;
      }
      appOrigin = parsedRedirect.origin;
    } catch {
      return;
    }

    const registration = document.createElement("p");
    registration.className = "den-register";
    registration.append(document.createTextNode("New to Den Suite? "));

    const link = document.createElement("a");
    link.href = new URL("/?register=1", appOrigin).toString();
    link.textContent = "Register";
    registration.append(link);
    form.insertAdjacentElement("afterend", registration);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeLogin);
  } else {
    initializeLogin();
  }
})();
