import { redirect } from "next/navigation";

// Superseded by /admin/products (cost + customer price + enable toggle all
// in one place). Kept as a redirect so old links/bookmarks still work.
export default function AdminServicesRedirect() {
  redirect("/admin/products");
}
