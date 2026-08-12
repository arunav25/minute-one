import { redirect } from "next/navigation";

/**
 * Opening Minute One should put you in the console.
 *
 * The console is the product: create a product, give the guide its knowledge,
 * author the journey, copy the script tag. A generic demo product lives at
 * /embed-test for trying the guide locally; the real JustCall integration runs
 * on the actual app at app.justcall.local.
 */
export default function Home() {
  redirect("/console");
}
