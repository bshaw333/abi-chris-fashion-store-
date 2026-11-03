import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:"Abi-Chris-Fashion and Store | Fashion, Home & Building Essentials",
  description: "Fashion, household goods, furniture and building materials — retail and wholesale.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
