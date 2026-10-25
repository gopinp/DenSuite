"use client";

import { useEffect, useState } from "react";
import { getKeycloak, initializeKeycloak } from "../lib/keycloak";

function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Greeting() {
  const [greeting, setGreeting] = useState("Hello");
  const [name, setName] = useState("");

  useEffect(() => {
    setGreeting(greetingFor(new Date()));
    async function loadName() {
      try {
        await initializeKeycloak();
        const claims = getKeycloak().tokenParsed as
          | { given_name?: string; preferred_username?: string }
          | undefined;
        setName(claims?.given_name ?? claims?.preferred_username ?? "");
      } catch {
        setName("");
      }
    }
    void loadName();
  }, []);

  return <>{name ? `${greeting}, ${name}` : greeting}</>;
}
