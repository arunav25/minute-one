import { FixtureProvider } from "../fixture-state";
import { FixtureApp } from "../FixtureApp";
import { GuideMount } from "../GuideMount";

/**
 * Optional catch-all so every /fixture/* path renders the example product.
 * The fixture pushes real history entries, so route rules are meaningful and a
 * refresh on a deep link still works.
 */
export default function FixturePage() {
  return (
    <FixtureProvider>
      <FixtureApp />
      <GuideMount />
    </FixtureProvider>
  );
}
