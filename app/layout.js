import "./globals.css";

export const metadata = {
  title: "NexaVerify",
  description: "Buy verification phone numbers instantly.",
};

// Sets the `dark` class on <html> before the page paints, based on the
// visitor's saved preference. Light is always the default — dark only ever
// turns on if the visitor previously tapped the toggle (we never infer it
// from the OS/browser color-scheme). Runs inline and blocking, on purpose,
// so there's no flash of the wrong theme on load — this can't be a normal
// useEffect because that would run after first paint. Since the choice is
// stored in localStorage (not a cookie or session value), it survives
// closing the tab/browser and stays until the visitor taps the icon again.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    if (window.localStorage.getItem("nexa-theme") === "dark") {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
