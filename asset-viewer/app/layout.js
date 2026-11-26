import "./globals.css";

export const metadata = {
  title: "Scheme Plan Asset Viewer (prototype)",
  description: "Click assets on a scheme plan to attach links, notes and status.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
