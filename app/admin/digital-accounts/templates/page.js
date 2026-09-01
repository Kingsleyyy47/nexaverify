import ProductTemplateManager from "@/components/ProductTemplateManager";

export default function AdminDigitalTemplatesPage() {
  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">Product Templates</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          Create and manage product templates for bulk account uploads. Each template belongs to a
          category, has its own price, and gets stocked with accounts at Bulk Account Upload.
        </p>
      </div>

      <ProductTemplateManager />
    </div>
  );
}
