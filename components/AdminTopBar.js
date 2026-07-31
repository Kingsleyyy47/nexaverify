import ThemeToggle from "./ThemeToggle";

export default function AdminTopBar() {
  return (
    <div className="flex items-center justify-end mb-6 pb-4 border-b border-gray-100 dark:border-night-800">
      <ThemeToggle />
    </div>
  );
}
