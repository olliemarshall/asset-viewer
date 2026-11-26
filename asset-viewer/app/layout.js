import "./globals.css";

export const metadata = {
  title: "SchemeWorks | Engineering coordination",
  description: "Coordinate engineering projects, schemes, drawings and assets in one workspace.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
