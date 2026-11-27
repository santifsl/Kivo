import { ArrowRight, Check, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { PLAN_LIMITS, type Plan, type Project } from "@kivo/shared";
import {
  CONVERSATIONS_TAB,
  INSTALL_TAB,
  KNOWLEDGE_TAB,
  projectTabHref,
} from "../projects/project-tabs";
import { UsageBar } from "../projects/usage-bar";
import { formatCount, monthlyUsage } from "../projects/usage";
import { Card } from "../ui/card";
import { cn } from "../ui/cn";
import { EmptyState } from "../ui/empty-state";
import { StatCard } from "../ui/stat-card";
import { formatRelativeTime, type OverviewData } from "./overview";

// A project's Overview, drawn from server-read data. Visitor text is rendered as text (React escapes it).

export function OverviewView({
  project,
  plan,
  data,
  now = new Date(),
}: {
  project: Pick<Project, "id" | "messages_used" | "period_start">;
  plan: Plan | null;
  data: OverviewData;
  now?: Date;
}) {
  const usage = plan ? monthlyUsage(project, plan, now) : null;
  const sourceLimit = plan ? PLAN_LIMITS[plan].knowledgeSources : null;
  const conversationsHref = projectTabHref(project.id, CONVERSATIONS_TAB);

  return (
    <div className="flex flex-col gap-6">
      {data.readySourceCount === 0 ? <GetStarted projectId={project.id} hasSources={data.sourceCount > 0} /> : null}

      <section aria-label="Stats" className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Messages this month"
          value={
            usage ? (
              <>
                {formatCount(usage.used)}
                <span className="text-xl text-ink-subtle"> / {formatCount(usage.limit)}</span>
              </>
            ) : (
              "—"
            )
          }
          sub={
            usage ? (
              <div className="flex flex-col gap-2">
                <UsageBar ratio={usage.ratio} />
                Resets {usage.resetsOn}
              </div>
            ) : (
              "Usage unavailable"
            )
          }
        />
        <StatCard label="Conversations" value={formatCount(data.conversationCount)} sub="All time" />
        <StatCard
          label="Knowledge sources"
          value={
            <>
              {formatCount(data.sourceCount)}
              {sourceLimit !== null ? (
                <span className="text-xl text-ink-subtle"> / {formatCount(sourceLimit)}</span>
              ) : null}
            </>
          }
          sub={`${formatCount(data.readySourceCount)} ready`}
        />
      </section>

      <Card as="section" aria-labelledby="recent-conversations" className="flex flex-col">
        <div className="flex items-center justify-between gap-4 px-5 pt-5 pb-3">
          <h2 id="recent-conversations" className="text-base font-medium text-ink">
            Recent conversations
          </h2>
          {data.recent.length > 0 ? (
            <Link
              href={conversationsHref}
              className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
            >
              View all <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            </Link>
          ) : null}
        </div>
        {data.recent.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="No conversations yet"
            description="When visitors chat with your widget, their conversations show up here."
          />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {data.recent.map((conversation) => (
              <li key={conversation.id}>
                <Link
                  href={`${conversationsHref}/${encodeURIComponent(conversation.id)}`}
                  className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-wash focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                >
                  <span className={cn("min-w-0 truncate text-sm", conversation.preview ? "text-ink" : "text-ink-subtle")}>
                    {conversation.preview || "No visitor message"}
                  </span>
                  <time dateTime={conversation.created_at} className="shrink-0 text-xs text-ink-subtle">
                    {formatRelativeTime(conversation.created_at, now)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Shown until the project has a ready knowledge source. */
function GetStarted({ projectId, hasSources }: { projectId: string; hasSources: boolean }) {
  const steps = [
    {
      title: "Add knowledge",
      body: hasSources
        ? "Your sources are processing. The bot answers once one is ready."
        : "Upload a file or paste text the bot should answer from.",
      href: projectTabHref(projectId, KNOWLEDGE_TAB),
      done: false,
    },
    {
      title: "Install widget",
      body: "Copy one line of code into your website.",
      href: projectTabHref(projectId, INSTALL_TAB),
      done: false,
    },
    {
      title: "Test a question",
      body: "Open your site and ask the widget something your knowledge covers.",
      href: projectTabHref(projectId, INSTALL_TAB),
      done: false,
    },
  ];
  return (
    <Card as="section" aria-labelledby="get-started" className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 id="get-started" className="text-base font-medium text-ink">
          Get started
        </h2>
        <p className="text-sm text-ink-muted">Three steps to a working chat widget.</p>
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((step, index) => (
          <li key={step.title}>
            <Link
              href={step.href}
              className="flex items-start gap-3 rounded-md border border-line p-3 hover:bg-wash focus-visible:outline-2 focus-visible:outline-brand"
            >
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-xs font-medium text-ink-muted"
              >
                {step.done ? <Check className="size-3.5" strokeWidth={2} /> : index + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium text-ink">{step.title}</span>
                <span className="text-sm text-ink-muted">{step.body}</span>
              </span>
              <ArrowRight aria-hidden="true" className="mt-0.5 ml-auto size-4 shrink-0 text-ink-subtle" strokeWidth={1.75} />
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
