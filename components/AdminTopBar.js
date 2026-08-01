import ThemeToggle from "./ThemeToggle";

// Theme toggle here is desktop-only — on mobile it already lives in
// AdminSidebar's header bar next to the menu button, so it isn't duplicated.
export default function AdminTopBar() {
  return (
    <div className="hidden md:flex items-center justify-end mb-6 pb-4 border-b border-gray-100 dark:border-night-800">
      <ThemeToggle />
    </div>
  );
}
