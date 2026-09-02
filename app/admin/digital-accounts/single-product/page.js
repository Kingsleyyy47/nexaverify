import SingleProductForm from "@/components/SingleProductForm";

export default function AdminSingleProductPage() {
  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">Single Product</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          Add one account manually to an existing product template — for stocking accounts one at
          a time instead of a CSV. Pick an already-created category and template; nothing is saved
          until every required field is filled in.
        </p>
      </div>

      <div className="card card-pad">
        <SingleProductForm />
      </div>
    </div>
  );
}
