import { redirect } from "next/navigation";

// Renamed to /products. Kept as a redirect so old links/bookmarks still work.
export default function BuyRedirect() {
  redirect("/products");
}
