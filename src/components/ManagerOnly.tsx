"use client";

import { useEffect, useState } from "react";
import { getKeycloak, initializeKeycloak } from "../lib/keycloak";

/** Renders its children only for practice owners and practice managers. */
export default function ManagerOnly({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    initializeKeycloak()
      .then(() => {
        const keycloak = getKeycloak();
        setAllowed(keycloak.hasRealmRole("EMPLOYER") || keycloak.hasRealmRole("PRACTICE_MANAGER"));
      })
      .catch(() => setAllowed(false));
  }, []);

  return allowed ? <>{children}</> : null;
}
