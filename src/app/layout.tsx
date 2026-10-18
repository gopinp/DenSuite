import type { Metadata } from "next";
import AuthSession from "../components/AuthSession";
import SuiteShell from "../components/SuiteShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Den Suite | Practice workspace",
  description: "One connected workspace for your dental practice team.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen" suppressHydrationWarning>
        <AuthSession />
        <SuiteShell>{children}</SuiteShell>
      </body>
    </html>
  );
}
