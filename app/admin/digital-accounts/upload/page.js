import BulkAccountUpload from "@/components/BulkAccountUpload";

export default function AdminDigitalUploadPage() {
  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">Bulk Account Upload</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          Upload CSV files with account credentials to an existing product template.
        </p>
      </div>

      <div className="card card-pad">
        <BulkAccountUpload />
      </div>
    </div>
  );
}
