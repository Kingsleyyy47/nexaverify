import PlatformLogoManager from "@/components/PlatformLogoManager";

export default function AdminPlatformLogosPage() {
  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold">Platform Logos</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1 max-w-lg">
          One logo per platform, used everywhere. Add "TikTok" here once and its logo shows up next
          to every matching service/product across DaisySMS Products, US Only, International, Social
          Boost — and any future provider, automatically.
        </p>
      </div>

      <div className="card card-pad">
        <PlatformLogoManager />
      </div>
    </div>
  );
}
