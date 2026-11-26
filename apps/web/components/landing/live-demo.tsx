import { APP_NAME } from "@kivo/shared";
import { LandingWidget } from "./landing-widget";
import { Section } from "./section";

export function LiveDemo({ widgetKey }: { widgetKey: string }) {
  return (
    <Section
      id="demo"
      eyebrow="Live demo"
      title="Try the support chat"
      description={`Open the chat in the bottom-right corner and ask how to install ${APP_NAME} on your site.`}
    >
      <LandingWidget widgetKey={widgetKey} />
    </Section>
  );
}
