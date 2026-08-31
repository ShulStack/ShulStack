"use client";

import { api } from "@shulstack/convex/_generated/api";
import type { Id } from "@shulstack/convex/_generated/dataModel";
import {
  type ImportedAccount,
  type ImportedPerson,
  type ImportedTransaction,
  mapAccountsCsv,
  mapPeopleCsv,
  mapTransactionsCsv,
  type RowIssue,
} from "@shulstack/platform";
import { Button, Card, EmptyState, PageHeader } from "@shulstack/ui";
import { useMutation } from "convex/react";
import { useState } from "react";

import { useCanAdminister, useWorkspace } from "../../../../components/use-workspace";
import { errorMessage } from "../../../../lib/format";

const BATCH_SIZE = 50;

export default function ImportPage() {
  const workspace = useWorkspace();
  const canAdminister = useCanAdminister();
  if (workspace === undefined || workspace === null) {
    return null;
  }
  if (!canAdminister) {
    return <EmptyState description="Importing data requires the admin role." title="Admins only" />;
  }
  return (
    <>
      <PageHeader
        description="Bring your ShulCloud data across: export accounts, people, and transactions as CSV, then load them here. Re-running an import never duplicates records."
        title="Import from ShulCloud"
      />
      <AccountsImportCard institutionId={workspace.institution._id} />
      <PeopleImportCard institutionId={workspace.institution._id} />
      <TransactionsImportCard institutionId={workspace.institution._id} />
    </>
  );
}

type ImportStats = {
  created: number;
  updated: number;
  skipped: number;
  unmatched: number;
  warnings: string[];
};
type BatchResult = Partial<Omit<ImportStats, "warnings">> & { warnings?: string[] };

function useBatchImport<Row>(runBatch: (rows: Row[]) => Promise<BatchResult>) {
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<ImportStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(rows: Row[]) {
    setError(null);
    setResult(null);
    const totals: ImportStats = { created: 0, updated: 0, skipped: 0, unmatched: 0, warnings: [] };
    try {
      for (let start = 0; start < rows.length; start += BATCH_SIZE) {
        setProgress(`Importing ${Math.min(start + BATCH_SIZE, rows.length)} of ${rows.length}…`);
        const batch = await runBatch(rows.slice(start, start + BATCH_SIZE));
        totals.created += batch.created ?? 0;
        totals.updated += batch.updated ?? 0;
        totals.skipped += batch.skipped ?? 0;
        totals.unmatched += batch.unmatched ?? 0;
        totals.warnings = [...totals.warnings, ...(batch.warnings ?? [])];
      }
      setResult(totals);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setProgress(null);
    }
  }
  return { run, progress, result, error };
}

function ImportSummary({
  issues,
  progress,
  result,
  error,
}: {
  issues: RowIssue[];
  progress: string | null;
  result: ImportStats | null;
  error: string | null;
}) {
  return (
    <>
      {issues.length === 0 ? null : (
        <div className="import-issues">
          <p className="form-error">
            {issues.length} row{issues.length === 1 ? "" : "s"} could not be mapped:
          </p>
          <ul className="muted">
            {issues.slice(0, 5).map((issue) => (
              <li key={issue.row}>
                Row {issue.row}: {issue.message}
              </li>
            ))}
            {issues.length > 5 ? <li>…and {issues.length - 5} more</li> : null}
          </ul>
        </div>
      )}
      {progress === null ? null : <p className="muted">{progress}</p>}
      {error === null ? null : <p className="form-error">{error}</p>}
      {result === null ? null : (
        <p className="form-success">
          Done: {describeImportResult(result)}.
          {result.warnings.length > 0
            ? ` ${result.warnings.length} warning(s): ${result.warnings.slice(0, 3).join("; ")}${result.warnings.length > 3 ? "…" : ""}`
            : ""}
        </p>
      )}
    </>
  );
}

function describeImportResult(result: ImportStats): string {
  const parts = [`${result.created} created`];
  if (result.updated > 0) {
    parts.push(`${result.updated} updated`);
  }
  if (result.skipped > 0) {
    parts.push(`${result.skipped} already imported`);
  }
  if (result.unmatched > 0) {
    parts.push(`${result.unmatched} without a matching account`);
  }
  return parts.join(", ");
}

function AccountsImportCard({ institutionId }: { institutionId: Id<"institutions"> }) {
  const importAccounts = useMutation(api.imports.importAccounts);
  const [rows, setRows] = useState<ImportedAccount[]>([]);
  const [issues, setIssues] = useState<RowIssue[]>([]);
  const batch = useBatchImport<ImportedAccount>((accounts) =>
    importAccounts({ institutionId, accounts }),
  );

  return (
    <Card title="Step 1: Accounts (households)">
      <p className="muted">
        The accounts export becomes households, with addresses, contact info, and opening balances
        recorded on the ledger.
      </p>
      <input
        accept=".csv,text/csv"
        aria-label="Accounts CSV file"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (file === undefined) {
            return;
          }
          const mapped = mapAccountsCsv(await file.text());
          setRows(mapped.accounts);
          setIssues(mapped.issues);
        }}
        type="file"
      />
      {rows.length === 0 ? null : (
        <div className="inline-form">
          <p className="muted">{rows.length} households ready to import.</p>
          <Button disabled={batch.progress !== null} onClick={() => void batch.run(rows)}>
            Import accounts
          </Button>
        </div>
      )}
      <ImportSummary
        error={batch.error}
        issues={issues}
        progress={batch.progress}
        result={batch.result}
      />
    </Card>
  );
}

function TransactionsImportCard({ institutionId }: { institutionId: Id<"institutions"> }) {
  const importTransactions = useMutation(api.imports.importTransactions);
  const [rows, setRows] = useState<ImportedTransaction[]>([]);
  const [issues, setIssues] = useState<RowIssue[]>([]);
  const batch = useBatchImport<ImportedTransaction>((transactions) =>
    importTransactions({ institutionId, transactions }),
  );

  return (
    <Card title="Step 3: Transactions">
      <p className="muted">
        Charges and payments land on each household's ledger, linked through the account id.
        Households with an imported opening balance keep their total — the detail replaces the
        summary instead of double-counting it. Already-imported transactions are skipped, so
        re-running an export is safe.
      </p>
      <input
        accept=".csv,text/csv"
        aria-label="Transactions CSV file"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (file === undefined) {
            return;
          }
          const mapped = mapTransactionsCsv(await file.text());
          setRows(mapped.transactions);
          setIssues(mapped.issues);
        }}
        type="file"
      />
      {rows.length === 0 ? null : (
        <div className="inline-form">
          <p className="muted">{rows.length} transactions ready to import.</p>
          <Button disabled={batch.progress !== null} onClick={() => void batch.run(rows)}>
            Import transactions
          </Button>
        </div>
      )}
      <ImportSummary
        error={batch.error}
        issues={issues}
        progress={batch.progress}
        result={batch.result}
      />
    </Card>
  );
}

function PeopleImportCard({ institutionId }: { institutionId: Id<"institutions"> }) {
  const importPeople = useMutation(api.imports.importPeople);
  const [rows, setRows] = useState<ImportedPerson[]>([]);
  const [issues, setIssues] = useState<RowIssue[]>([]);
  const batch = useBatchImport<ImportedPerson>((people) => importPeople({ institutionId, people }));

  return (
    <Card title="Step 2: People">
      <p className="muted">
        Import accounts first — people are linked to their household through the account id column.
        People whose account isn't found are still imported, with a warning.
      </p>
      <input
        accept=".csv,text/csv"
        aria-label="People CSV file"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (file === undefined) {
            return;
          }
          const mapped = mapPeopleCsv(await file.text());
          setRows(mapped.people);
          setIssues(mapped.issues);
        }}
        type="file"
      />
      {rows.length === 0 ? null : (
        <div className="inline-form">
          <p className="muted">{rows.length} people ready to import.</p>
          <Button disabled={batch.progress !== null} onClick={() => void batch.run(rows)}>
            Import people
          </Button>
        </div>
      )}
      <ImportSummary
        error={batch.error}
        issues={issues}
        progress={batch.progress}
        result={batch.result}
      />
    </Card>
  );
}
