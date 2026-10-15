import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";

export const metadata: Metadata = { title: "Om oss" };

export default function AboutPage() {
  return (
    <ContentPage title="Om Parklet" intro="Parkeringsproblemet handlar sällan om brist på yta, utan om att ytan används dåligt.">
      <p>Tusentals parkeringsplatser står tomma varje dag hos privatpersoner, bostadsrättsföreningar, företag och fastighetsägare, samtidigt som förare letar. Parklet kopplar ihop dem på ett tryggt sätt: verifierade uthyrare, säker betalning och tydliga regler.</p>
      <p>Parklet grundades i Göteborg och växer stad för stad i nära dialog med användare, föreningar och fastighetsägare.</p>
    </ContentPage>
  );
}
