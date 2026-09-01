import DigitalAccountsBrowser from "@/components/DigitalAccountsBrowser";

export default function DigitalAccountsPage() {
  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold">Digital Accounts</h1>
        <p className="text-sm text-gray-400 dark:text-night-400 mt-1">
          Ready-made accounts, delivered instantly — pick a category, choose a product, and check
          out from your wallet balance.
        </p>
      </div>
      <DigitalAccountsBrowser />
    </div>
  );
}
