import CategoryManager from "@/components/CategoryManager";

export default function AdminDigitalCategoriesPage() {
  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">Category Management</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          Manage product categories and organization. Create a category here first, then add
          product templates under it at Product Templates.
        </p>
      </div>

      <div className="card card-pad">
        <CategoryManager />
      </div>
    </div>
  );
}
