import { redirect } from "next/navigation";

// Renamed to /rentals. Kept as a redirect so old links/bookmarks still work.
export default function NumbersRedirect() {
  redirect("/rentals");
}
