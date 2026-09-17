import CategoryShuffle from "@/components/CategoryShuffle";

export default function AdminCategoryShufflePage() {
  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">Category Shuffle</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          Rearrange the order Logs categories appear in for customers — on the Logs page and the
          dashboard.
        </p>
      </div>

      <div className="card card-pad">
        <CategoryShuffle />
      </div>
    </div>
  );
}
