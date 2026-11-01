"use client";

import { useEffect, useState } from "react";
import { getKeycloak, initializeKeycloak } from "../lib/keycloak";

export default function ManagePracticesLabel() {
  const [singular, setSingular] = useState(false);

  useEffect(() => {
    initializeKeycloak()
      .then(() => {
        const keycloak = getKeycloak();
        setSingular(
          keycloak.hasRealmRole("PRACTICE_MANAGER") && !keycloak.hasRealmRole("EMPLOYER"),
        );
      })
      .catch(() => setSingular(false));
  }, []);

  return <>{singular ? "Manage practice" : "Manage practices"}</>;
}
