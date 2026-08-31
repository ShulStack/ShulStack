"use client";

import { api } from "@shulstack/convex/_generated/api";
import type { Doc, Id } from "@shulstack/convex/_generated/dataModel";
import { formatMoney, PLEDGE_STAGES, type PledgeStage, parseMoney } from "@shulstack/platform";
import { Badge, Button, Card, EmptyState, Field, PageHeader, Stat } from "@shulstack/ui";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { type RichTextDoc, RichTextField } from "../../../../../components/rich-text-field";
import { useCanAdminister } from "../../../../../components/use-workspace";
import { errorMessage, formatIsoDate, todayIsoDate } from "../../../../../lib/format";

type JoinedPledge = NonNullable<
  FunctionReturnType<typeof api.fundraising.getCampaign>
>["pledges"][number];

export default function CampaignPage() {
  const params = useParams<{ slug: string; campaignId: string }>();
  const campaignId = params.campaignId as Id<"campaigns">;
  const detail = useQuery(api.fundraising.getCampaign, { campaignId });

  if (detail === undefined) {
    return <p className="muted">Loading…</p>;
  }
  if (detail === null) {
    return (
      <EmptyState
        action={
          <Link className="button secondary" href={`/app/${params.slug}/fundraising`}>
            Back to fundraising
          </Link>
        }
        title="Campaign not found"
      />
    );
  }

  const { campaign, pledges, rollup } = detail;
  return (
    <>
      <PageHeader
        actions={<CampaignStatus campaign={campaign} />}
        description={campaign.description ?? undefined}
        title={campaign.name}
      />
      <div className="stat-grid">
        <Stat label="Committed" value={formatMoney(rollup.committedMinor)} />
        <Stat
          hint={
            campaign.goalMinor === undefined || campaign.goalMinor === 0
              ? undefined
              : `${Math.min(100, Math.round((rollup.raisedMinor / campaign.goalMinor) * 100))}% of ${formatMoney(campaign.goalMinor)}`
          }
          label="Received"
          value={formatMoney(rollup.raisedMinor)}
        />
        <Stat label="Open pledges" value={rollup.openCount} />
        <Stat label="Total pledges" value={rollup.pledgeCount} />
      </div>
      <AddPledgeForm campaign={campaign} />
      <PledgeBoard pledges={pledges} slug={params.slug} />
    </>
  );
}

function CampaignStatus({ campaign }: { campaign: Doc<"campaigns"> }) {
  const canAdminister = useCanAdminister();
  const updateCampaign = useMutation(api.fundraising.updateCampaign);
  return (
    <div className="header-status">
      <Badge tone={campaign.status === "active" ? "positive" : "neutral"}>{campaign.status}</Badge>
      {canAdminister ? (
        <Button
          onClick={() =>
            void updateCampaign({
              campaignId: campaign._id,
              status: campaign.status === "active" ? "archived" : "active",
            })
          }
          variant="secondary"
        >
          {campaign.status === "active" ? "Archive" : "Reactivate"}
        </Button>
      ) : null}
    </div>
  );
}

function AddPledgeForm({ campaign }: { campaign: Doc<"campaigns"> }) {
  const createPledge = useMutation(api.fundraising.createPledge);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ id: Id<"households">; name: string } | null>(null);
  const matches = useQuery(
    api.crm.searchHouseholds,
    search.trim() === "" || selected !== null
      ? "skip"
      : { institutionId: campaign.institutionId, query: search },
  );
  const householdDetail = useQuery(
    api.crm.getHousehold,
    selected === null ? "skip" : { householdId: selected.id },
  );
  const [personId, setPersonId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<PledgeStage>("prospect");
  const [notesDoc, setNotesDoc] = useState<RichTextDoc | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card title="Add a pledge">
      {selected === null ? (
        <>
          <Field label="Find a household">
            {(id) => (
              <input
                id={id}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search households…"
                type="search"
                value={search}
              />
            )}
          </Field>
          {matches !== undefined && matches.length > 0 ? (
            <ul className="search-results">
              {matches.map((household) => (
                <li key={household._id}>
                  <span>{household.displayName}</span>
                  <Button
                    onClick={() => {
                      setSelected({ id: household._id, name: household.displayName });
                      setSearch("");
                    }}
                    variant="secondary"
                  >
                    Select
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            let amountMinor = 0;
            try {
              amountMinor = amount.trim() === "" ? 0 : parseMoney(amount);
            } catch (caught) {
              setError(errorMessage(caught));
              return;
            }
            setPending(true);
            createPledge({
              campaignId: campaign._id,
              householdId: selected.id,
              ...(personId === "" ? {} : { personId: personId as Id<"people"> }),
              amountMinor,
              stage,
              ...(notesDoc === null ? {} : { notesDoc }),
            })
              .then(() => {
                setSelected(null);
                setPersonId("");
                setAmount("");
                setStage("prospect");
                setNotesDoc(null);
              })
              .catch((caught) => setError(errorMessage(caught)))
              .finally(() => setPending(false));
          }}
        >
          <Field label="Household">
            {(id) => (
              <div className="copy-row">
                <strong id={id}>{selected.name}</strong>
                <Button onClick={() => setSelected(null)} variant="secondary">
                  Change
                </Button>
              </div>
            )}
          </Field>
          <Field hint="Optional attribution" label="Person">
            {(id) => (
              <select
                id={id}
                onChange={(event) => setPersonId(event.target.value)}
                value={personId}
              >
                <option value="">Whole household</option>
                {(householdDetail?.members ?? []).map((member) => (
                  <option key={member.personId} value={member.personId}>
                    {member.displayName}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field hint="Leave blank for prospects" label="Ask amount">
            {(id) => (
              <input
                id={id}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="1,800"
                value={amount}
              />
            )}
          </Field>
          <Field label="Stage">
            {(id) => (
              <select
                id={id}
                onChange={(event) => setStage(event.target.value as PledgeStage)}
                value={stage}
              >
                {PLEDGE_STAGES.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Notes">
            {() => <RichTextField onChange={setNotesDoc} placeholder="Met at kiddush…" />}
          </Field>
          <Button disabled={pending} type="submit">
            Add pledge
          </Button>
        </form>
      )}
      {error === null ? null : <p className="form-error">{error}</p>}
    </Card>
  );
}

function PledgeBoard({ pledges, slug }: { pledges: JoinedPledge[]; slug: string }) {
  return (
    <div className="pledge-board">
      {PLEDGE_STAGES.map((stage) => {
        const inStage = pledges.filter((pledge) => pledge.stage === stage.slug);
        const totalMinor = inStage.reduce((sum, pledge) => sum + pledge.amountMinor, 0);
        return (
          <section aria-label={stage.label} className="pledge-column" key={stage.slug}>
            <header className="pledge-column-header">
              <h3>{stage.label}</h3>
              <p className="muted">
                {inStage.length} · {formatMoney(totalMinor)}
              </p>
            </header>
            {inStage.map((pledge) => (
              <PledgeCard key={pledge.pledgeId} pledge={pledge} slug={slug} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function nextInstallment(installments: JoinedPledge["installments"]): string | undefined {
  const today = todayIsoDate();
  return (
    installments.find((row) => row.dueDate >= today)?.dueDate ??
    installments[installments.length - 1]?.dueDate
  );
}

function PledgeCard({ pledge, slug }: { pledge: JoinedPledge; slug: string }) {
  const updatePledge = useMutation(api.fundraising.updatePledge);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"gift" | "notes" | "schedule" | null>(null);
  const toggle = (next: "gift" | "notes" | "schedule") =>
    setPanel((current) => (current === next ? null : next));

  return (
    <article className="pledge-card">
      <Link href={`/app/${slug}/households/${pledge.householdId}`}>
        <strong>{pledge.householdName}</strong>
      </Link>
      {pledge.personName === undefined ? null : <p className="muted">{pledge.personName}</p>}
      <p className="pledge-amounts">
        {pledge.amountMinor === 0 ? (
          <span className="muted">no ask yet</span>
        ) : (
          <>
            {formatMoney(pledge.paidMinor)}{" "}
            <span className="muted">of {formatMoney(pledge.amountMinor)}</span>
          </>
        )}
      </p>
      {pledge.installments.length > 0 ? (
        <p className="muted pledge-notes">
          {pledge.installments.length} installments · next{" "}
          {formatIsoDate(nextInstallment(pledge.installments) ?? "")}
        </p>
      ) : null}
      {pledge.notes === undefined ? null : <p className="muted pledge-notes">{pledge.notes}</p>}
      <div className="pledge-card-actions">
        <select
          aria-label={`Stage for ${pledge.householdName}`}
          onChange={(event) => {
            setError(null);
            updatePledge({
              pledgeId: pledge.pledgeId,
              stage: event.target.value as PledgeStage,
            }).catch((caught) => setError(errorMessage(caught)));
          }}
          value={pledge.stage}
        >
          {PLEDGE_STAGES.map((option) => (
            <option key={option.slug} value={option.slug}>
              {option.label}
            </option>
          ))}
        </select>
        <Button onClick={() => toggle("gift")} variant="secondary">
          {panel === "gift" ? "Close" : "Gift"}
        </Button>
        <Button onClick={() => toggle("notes")} variant="secondary">
          Notes
        </Button>
        <Button onClick={() => toggle("schedule")} variant="secondary">
          Schedule
        </Button>
      </div>
      {panel === "gift" ? (
        <GiftForm onDone={() => setPanel(null)} pledgeId={pledge.pledgeId} />
      ) : null}
      {panel === "notes" ? <NotesForm onDone={() => setPanel(null)} pledge={pledge} /> : null}
      {panel === "schedule" ? <ScheduleForm onDone={() => setPanel(null)} pledge={pledge} /> : null}
      {error === null ? null : <p className="form-error">{error}</p>}
    </article>
  );
}

function NotesForm({ pledge, onDone }: { pledge: JoinedPledge; onDone: () => void }) {
  const updatePledge = useMutation(api.fundraising.updatePledge);
  const [doc, setDoc] = useState<RichTextDoc | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialDoc =
    (pledge.notesDoc as RichTextDoc | undefined) ??
    (pledge.notes === undefined ? undefined : plainToDoc(pledge.notes));

  return (
    <div className="gift-form">
      <RichTextField initialDoc={initialDoc} onChange={setDoc} placeholder="Notes…" />
      <Button
        disabled={pending || doc === null}
        onClick={() => {
          if (doc === null) {
            return;
          }
          setError(null);
          setPending(true);
          updatePledge({ pledgeId: pledge.pledgeId, notesDoc: doc })
            .then(onDone)
            .catch((caught) => setError(errorMessage(caught)))
            .finally(() => setPending(false));
        }}
        variant="secondary"
      >
        Save notes
      </Button>
      {error === null ? null : <p className="form-error">{error}</p>}
    </div>
  );
}

function plainToDoc(text: string): RichTextDoc {
  return {
    type: "doc",
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      content: line === "" ? [] : [{ type: "text", text: line }],
    })),
  };
}

type InstallmentDraft = { dueDate: string; amount: string };

function ScheduleForm({ pledge, onDone }: { pledge: JoinedPledge; onDone: () => void }) {
  const setPledgeSchedule = useMutation(api.fundraising.setPledgeSchedule);
  const [rows, setRows] = useState<InstallmentDraft[]>(() =>
    pledge.installments.length > 0
      ? pledge.installments.map((row) => ({
          dueDate: row.dueDate,
          amount: (row.amountMinor / 100).toFixed(2),
        }))
      : [{ dueDate: todayIsoDate(), amount: "" }],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (index: number, patch: Partial<InstallmentDraft>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="gift-form">
      <p className="muted">
        Split this pledge over time — the pledge total becomes the sum of the installments.
      </p>
      {rows.map((row, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: drafts have no ids
        <div className="installment-row" key={index}>
          <input
            aria-label={`Installment ${index + 1} due date`}
            onChange={(event) => update(index, { dueDate: event.target.value })}
            type="date"
            value={row.dueDate}
          />
          <input
            aria-label={`Installment ${index + 1} amount`}
            onChange={(event) => update(index, { amount: event.target.value })}
            placeholder="10,000"
            value={row.amount}
          />
          <Button
            onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
            variant="danger"
          >
            ✕
          </Button>
        </div>
      ))}
      <div className="copy-row">
        <Button
          onClick={() => setRows((current) => [...current, { dueDate: "", amount: "" }])}
          variant="secondary"
        >
          Add installment
        </Button>
        <Button
          disabled={pending}
          onClick={() => {
            setError(null);
            let installments: { dueDate: string; amountMinor: number }[];
            try {
              installments = rows
                .filter((row) => row.dueDate !== "" || row.amount.trim() !== "")
                .map((row) => ({ dueDate: row.dueDate, amountMinor: parseMoney(row.amount) }));
            } catch (caught) {
              setError(errorMessage(caught));
              return;
            }
            setPending(true);
            setPledgeSchedule({ pledgeId: pledge.pledgeId, installments })
              .then(onDone)
              .catch((caught) => setError(errorMessage(caught)))
              .finally(() => setPending(false));
          }}
        >
          Save schedule
        </Button>
      </div>
      {error === null ? null : <p className="form-error">{error}</p>}
    </div>
  );
}

function GiftForm({ pledgeId, onDone }: { pledgeId: Id<"pledges">; onDone: () => void }) {
  const recordPledgePayment = useMutation(api.fundraising.recordPledgePayment);
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayIsoDate());
  const [method, setMethod] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="gift-form"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        let amountMinor = 0;
        try {
          amountMinor = parseMoney(amount);
        } catch (caught) {
          setError(errorMessage(caught));
          return;
        }
        setPending(true);
        recordPledgePayment({
          pledgeId,
          amountMinor,
          occurredAt,
          ...(method.trim() === "" ? {} : { method }),
        })
          .then(onDone)
          .catch((caught) => setError(errorMessage(caught)))
          .finally(() => setPending(false));
      }}
    >
      <input
        aria-label="Gift amount"
        onChange={(event) => setAmount(event.target.value)}
        placeholder="Amount"
        required
        value={amount}
      />
      <input
        aria-label="Gift date"
        onChange={(event) => setOccurredAt(event.target.value)}
        type="date"
        value={occurredAt}
      />
      <input
        aria-label="Method"
        onChange={(event) => setMethod(event.target.value)}
        placeholder="check, card…"
        value={method}
      />
      <Button disabled={pending} type="submit" variant="secondary">
        Save gift
      </Button>
      {error === null ? null : <p className="form-error">{error}</p>}
    </form>
  );
}
