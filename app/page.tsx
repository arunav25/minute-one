import { redirect } from "next/navigation";

/**
 * Opening Minute One should put you in the console.
 *
 * The console is the product: create a product, give the guide its knowledge,
 * author the journey, copy the script tag. The old landing copy lived here and
 * sent people to the JustCall-styled sandbox first, which made the sandbox look
 * like the point. It is still reachable at /fixture as a page to test against.
 */
export default function Home() {
  redirect("/console");
}
