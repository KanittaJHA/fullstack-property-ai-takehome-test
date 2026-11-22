import type { Metadata } from "next";
import localFont from "next/font/local";
import { WorkspaceProvider, Header } from "@/shell/workspace";
import "@/styles/globals.css";
import "@/styles/theme-readability.css";
import "@/styles/thai-typography.css";
import "@/styles/header-menu.css";
import "@/styles/main-nav.css";
import { WorkspaceScrollbar } from "@/shell/workspace-scrollbar";
const poppins = localFont({
  variable: "--font-poppins",
  src: [
    { path: "./fonts/Poppins-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Poppins-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/Poppins-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/Poppins-Bold.ttf", weight: "700", style: "normal" },
  ],
  display: "swap",
});
const thai = localFont({
  variable: "--font-thai",
  src: [{ path: "./fonts/NotoSansThai.ttf", weight: "100 900", style: "normal" }],
  display: "swap",
});
export const metadata: Metadata = {
  title: "What The Property — Find the right property for you",
  description:
    "Explore properties in Thailand and the Graspia sales workspace. Bilingual property matching and sales chat.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${poppins.variable} ${thai.variable}`}>
      <body>
        <WorkspaceProvider>
          <a className="skip-link" href="#main-content">
            Skip to content / ข้ามไปเนื้อหา
          </a>
          <Header />
          {children}
          <WorkspaceScrollbar />
        </WorkspaceProvider>
      </body>
    </html>
  );
}
