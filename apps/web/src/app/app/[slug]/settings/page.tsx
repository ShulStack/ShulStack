"use client";

import { api } from "@shulstack/convex/_generated/api";
import type { Id } from "@shulstack/convex/_generated/dataModel";
import { Badge, Button, Card, Field, PageHeader } from "@shulstack/ui";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { useCanAdminister, useWorkspace } from "../../../../components/use-workspace";
import { errorMessage } from "../../../../lib/format";

export default function SettingsPage() {
  const workspace = useWorkspace();
  const canAdminister = useCanAdminister();
  if (workspace === undefined || workspace === null) {
    return null;
  }
  return (
    <>
      <PageHeader
        description={
          canAdminister
            ? "Institution profile, modules, and staff access."
            : "Read-only: administration requires the admin role."
        }
        title="Settings"
      />
      <InstitutionForm
        canAdminister={canAdminister}
        institutionId={workspace.institution._id}
        initialName={workspace.institution.name}
        initialTimezone={workspace.institution.timezone}
      />
      <ModulesCard
        canAdminister={canAdminister}
        institutionId={workspace.institution._id}
        modules={workspace.modules}
      />
      <StaffCard
        canAdminister={canAdminister}
        institutionId={workspace.institution._id}
        isOwner={workspace.role === "owner"}
      />
    </>
  );
}

function InstitutionForm({
  institutionId,
  initialName,
  initialTimezone,
  canAdminister,
}: {
  institutionId: Id<"institutions">;
  initialName: string;
  initialTimezone: string;
  canAdminister: boolean;
}) {
  const updateInstitution = useMutation(api.platform.updateInstitution);
  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <Card title="Institution">
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setSaved(false);
          updateInstitution({ institutionId, name, timezone })
            .then(() => setSaved(true))
            .catch((caught) => setError(errorMessage(caught)));
        }}
      >
        <Field label="Name">
          {(id) => (
            <input
              disabled={!canAdminister}
              id={id}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          )}
        </Field>
        <Field hint="IANA timezone, e.g. America/New_York" label="Timezone">
          {(id) => (
            <input
              disabled={!canAdminister}
              id={id}
              onChange={(event) => setTimezone(event.target.value)}
              required
              value={timezone}
            />
          )}
        </Field>
        <Button disabled={!canAdminister} type="submit">
          Save
        </Button>
      </form>
      {error === null ? null : <p className="form-error">{error}</p>}
      {saved ? <p className="form-success">Saved.</p> : null}
    </Card>
  );
}

type WorkspaceModule = {
  slug: string;
  label: string;
  description: string;
  enabled: boolean;
};

function ModulesCard({
  institutionId,
  modules,
  canAdminister,
}: {
  institutionId: Id<"institutions">;
  modules: WorkspaceModule[];
  canAdminister: boolean;
}) {
  const setModuleEnabled = useMutation(api.platform.setModuleEnabled);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card title="Modules">
      {error === null ? null : <p className="form-error">{error}</p>}
      <div className="module-grid">
        {modules.map((module) => (
          <label
            className={module.enabled ? "module-tile enabled" : "module-tile"}
            key={module.slug}
          >
            <div className="module-tile-header">
              <h3>{module.label}</h3>
              <input
                checked={module.enabled}
                disabled={!canAdminister}
                onChange={(event) => {
                  setError(null);
                  setModuleEnabled({
                    institutionId,
                    // Workspace modules come from the platform registry, so the
                    // slug is always a valid ModuleSlug.
                    moduleSlug: module.slug as never,
                    enabled: event.target.checked,
                  }).catch((caught) => setError(errorMessage(caught)));
                }}
                type="checkbox"
              />
            </div>
            <p className="muted">{module.description}</p>
          </label>
        ))}
      </div>
    </Card>
  );
}

function StaffCard({
  institutionId,
  canAdminister,
  isOwner,
}: {
  institutionId: Id<"institutions">;
  canAdminister: boolean;
  isOwner: boolean;
}) {
  const staff = useQuery(api.platform.listStaff, { institutionId });
  const addStaffByEmail = useMutation(api.platform.addStaffByEmail);
  const setStaffActive = useMutation(api.platform.setStaffActive);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [error, setError] = useState<string | null>(null);

  return (
    <Card title="Staff">
      {staff === undefined ? (
        <p className="muted">Loading…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              {canAdminister ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <tr key={member.staffMemberId}>
                <td>
                  {member.email ?? member.name ?? "—"}
                  {member.isViewer ? <span className="muted"> (you)</span> : null}
                </td>
                <td>
                  <Badge tone={member.role === "staff" ? "neutral" : "positive"}>
                    {member.role}
                  </Badge>
                </td>
                <td>
                  <Badge tone={member.isActive ? "positive" : "neutral"}>
                    {member.isActive ? "active" : "inactive"}
                  </Badge>
                </td>
                {canAdminister ? (
                  <td className="table-actions">
                    {member.role === "owner" || member.isViewer ? null : (
                      <Button
                        onClick={() => {
                          setError(null);
                          setStaffActive({
                            staffMemberId: member.staffMemberId,
                            isActive: !member.isActive,
                          }).catch((caught) => setError(errorMessage(caught)));
                        }}
                        variant="secondary"
                      >
                        {member.isActive ? "Deactivate" : "Reactivate"}
                      </Button>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canAdminister ? (
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            addStaffByEmail({ institutionId, email, role })
              .then(() => setEmail(""))
              .catch((caught) => setError(errorMessage(caught)));
          }}
        >
          <Field hint="They need a ShulStack account first." label="Add staff by email">
            {(id) => (
              <input
                id={id}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="gabbai@example.com"
                required
                type="email"
                value={email}
              />
            )}
          </Field>
          <Field label="Role">
            {(id) => (
              <select
                id={id}
                onChange={(event) => setRole(event.target.value as typeof role)}
                value={role}
              >
                <option value="staff">staff</option>
                {isOwner ? <option value="admin">admin</option> : null}
              </select>
            )}
          </Field>
          <Button type="submit">Add</Button>
        </form>
      ) : null}
      {error === null ? null : <p className="form-error">{error}</p>}
    </Card>
  );
}
