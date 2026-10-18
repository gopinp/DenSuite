"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getKeycloak, initializeKeycloak } from "../lib/keycloak";

export default function AuthSession() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/") {
      return;
    }

    let active = true;
    initializeKeycloak()
      .then((authenticated) => {
        if (active && !authenticated) {
          window.location.replace("/");
          return;
        }
        if (!active || !authenticated) {
          return;
        }

        const isAdmin = getKeycloak().hasRealmRole("DENTSUITE_ADMIN");
        if (isAdmin && !pathname.startsWith("/admin")) {
          window.location.replace("/admin");
        }
      })
      .catch((error: unknown) => {
        console.error("Den Suite could not validate the Keycloak session.", error);
      });

    return () => {
      active = false;
    };
  }, [pathname]);

  return null;
}
