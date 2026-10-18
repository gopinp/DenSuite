"use client";

import Keycloak from "keycloak-js";

let keycloak: Keycloak | undefined;
let initialization: Promise<boolean> | undefined;

export function getKeycloak() {
  keycloak ??= new Keycloak({
    url: process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? "http://localhost:8180",
    realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM ?? "dentsuite",
    clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID ?? "dentsuite-web",
  });
  return keycloak;
}

export function initializeKeycloak() {
  if (!initialization) {
    initialization = getKeycloak()
      .init({
        onLoad: "check-sso",
        pkceMethod: "S256",
        checkLoginIframe: false,
        silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
      })
      .catch((error: unknown) => {
        initialization = undefined;
        throw error;
      });
  }
  return initialization;
}
