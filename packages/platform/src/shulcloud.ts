import { csvToRecords } from "./csv";
import { parseMoney } from "./money";

/**
 * Mapping from ShulCloud account/people CSV exports into ShulStack's import
 * shapes. Pure and tolerant: header aliases are normalized, unmapped columns
 * are preserved in metadata, and malformed rows come back as issues instead
 * of exceptions.
 */

export type ImportedAccount = {
  externalId: string;
  displayName: string;
  householdType?: string;
  billingAccountType?: string;
  mailLabel?: string;
  billingMailLabel?: string;
  addedAt?: string;
  joinedAt?: string;
  resignedAt?: string;
  isActive: boolean;
  openingBalanceMinor?: number;
  address?: {
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  email?: string;
  phone?: string;
  metadata: Record<string, string>;
};

export type ImportedContactPoint = {
  label: "home" | "mobile" | "work" | "fax" | "other";
  value: string;
};

export type ImportedPerson = {
  externalId: string;
  accountExternalId?: string;
  title?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  nickname?: string;
  suffix?: string;
  mailName?: string;
  personType?: string;
  gender: "male" | "female" | "nonbinary" | "unknown";
  maritalStatus?: string;
  maidenName?: string;
  hebrewGivenName?: string;
  hebrewFatherName?: string;
  hebrewMotherName?: string;
  hebrewFamilyName?: string;
  dateOfBirth?: string;
  hebrewBirthDate?: string;
  honoraryMember: boolean;
  eligibleForAliyah: boolean;
  isDeceased: boolean;
  isActive: boolean;
  memberRole: "head" | "spouse" | "child" | "dependent_adult" | "other";
  sourceRoleLabel?: string;
  isPrimaryContact: boolean;
  memberJoinedAt?: string;
  memberResignedAt?: string;
  emails: string[];
  phones: ImportedContactPoint[];
  metadata: Record<string, string>;
};

export type RowIssue = { row: number; message: string };

// --- Field helpers -------------------------------------------------------------

const TRUE_VALUES = new Set(["yes", "y", "true", "1", "x", "checked"]);
const FALSE_VALUES = new Set(["no", "n", "false", "0", "", "unchecked"]);

export function parseImportBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }
  return fallback;
}

/** "3/29/2026", "03/29/2026", or "2026-03-29" → "2026-03-29"; else undefined. */
export function parseImportDate(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(trimmed);
  if (iso !== null) {
    return `${iso[1]}-${iso[2]?.padStart(2, "0")}-${iso[3]?.padStart(2, "0")}`;
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
  if (us !== null) {
    const year = us[3]?.length === 2 ? `20${us[3]}` : us[3];
    return `${year}-${us[1]?.padStart(2, "0")}-${us[2]?.padStart(2, "0")}`;
  }
  return undefined;
}

/** "$1,234.56", "(45.00)" (negative), "1234.56" → minor units; else undefined. */
export function parseImportMoney(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  let trimmed = value.trim();
  let negative = false;
  const parens = /^\((.*)\)$/.exec(trimmed);
  if (parens?.[1] !== undefined) {
    negative = true;
    trimmed = parens[1];
  }
  try {
    const minor = parseMoney(trimmed);
    return negative ? -minor : minor;
  } catch {
    return undefined;
  }
}

export function parseImportGender(
  value: string | undefined,
): "male" | "female" | "nonbinary" | "unknown" {
  switch (value?.trim().toLowerCase()) {
    case "m":
    case "male":
      return "male";
    case "f":
    case "female":
      return "female";
    case "nonbinary":
    case "non-binary":
      return "nonbinary";
    default:
      return "unknown";
  }
}

const ROLE_MAP: Record<string, ImportedPerson["memberRole"]> = {
  head: "head",
  head_of_household: "head",
  primary: "head",
  spouse: "spouse",
  wife: "spouse",
  husband: "spouse",
  partner: "spouse",
  child: "child",
  son: "child",
  daughter: "child",
  dependent: "dependent_adult",
  dependent_adult: "dependent_adult",
};

export function parseImportRole(value: string | undefined): ImportedPerson["memberRole"] {
  if (value === undefined) {
    return "other";
  }
  return (
    ROLE_MAP[
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z]+/g, "_")
    ] ?? "other"
  );
}

function pick(record: Record<string, string>, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    if (record[alias] !== undefined) {
      return record[alias];
    }
  }
  return undefined;
}

function collectUnmapped(
  record: Record<string, string>,
  consumed: Set<string>,
): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!consumed.has(key)) {
      metadata[key] = value;
    }
  }
  return metadata;
}

function consuming(record: Record<string, string>, consumed: Set<string>) {
  return (aliases: string[]): string | undefined => {
    for (const alias of aliases) {
      consumed.add(alias);
    }
    return pick(record, aliases);
  };
}

/** A whole-file parse failure, reported as an issue on the header row. */
function fileIssue(error: unknown): RowIssue {
  return { row: 1, message: error instanceof Error ? error.message : String(error) };
}

// --- Accounts ------------------------------------------------------------------

const ACCOUNT_ID_ALIASES = ["id", "account_id", "account_number"];
const ACCOUNT_NAME_ALIASES = ["name", "account_name"];

export function mapAccountRow(
  record: Record<string, string>,
  rowNumber: number,
): { account?: ImportedAccount; issue?: RowIssue } {
  const consumed = new Set<string>();
  const take = consuming(record, consumed);

  const externalId = take(ACCOUNT_ID_ALIASES);
  const displayName = take(ACCOUNT_NAME_ALIASES);
  if (externalId === undefined) {
    return { issue: { row: rowNumber, message: "Missing account id column (id/account_id)" } };
  }
  if (displayName === undefined) {
    return { issue: { row: rowNumber, message: `Account ${externalId} has no name` } };
  }

  const resignedAt = parseImportDate(take(["date_resigned", "resigned"]));
  const account: ImportedAccount = {
    externalId,
    displayName,
    householdType: take(["account_type", "type"]),
    billingAccountType: take(["billing_account_type"]),
    mailLabel: take(["mail_label"]),
    billingMailLabel: take(["billing_mail_label"]),
    addedAt: parseImportDate(take(["date_added", "added"])),
    joinedAt: parseImportDate(take(["date_joined", "joined"])),
    resignedAt,
    // Without an explicit active flag, a resignation date means inactive.
    isActive: parseImportBoolean(take(["is_active", "active"]), resignedAt === undefined),
    openingBalanceMinor: parseImportMoney(take(["balance", "current_balance", "account_balance"])),
    address: {
      address1: take(["address", "address_1", "address1", "street"]),
      address2: take(["address_2", "address2"]),
      city: take(["city"]),
      state: take(["state", "province"]),
      postalCode: take(["zip", "zip_code", "postal_code"]),
      country: take(["country"]),
    },
    email: take(["email", "primary_email"]),
    phone: take(["phone", "home_phone", "primary_phone"]),
    metadata: collectUnmapped(record, consumed),
  };
  const hasAddress = Object.values(account.address ?? {}).some((value) => value !== undefined);
  if (!hasAddress) {
    account.address = undefined;
  }
  return { account };
}

export function mapAccountsCsv(text: string): {
  accounts: ImportedAccount[];
  issues: RowIssue[];
} {
  const accounts: ImportedAccount[] = [];
  const issues: RowIssue[] = [];
  let records: Record<string, string>[];
  try {
    records = csvToRecords(text);
  } catch (error) {
    return { accounts, issues: [fileIssue(error)] };
  }
  records.forEach((record, index) => {
    if (Object.keys(record).length === 0) {
      return; // blank line
    }
    const { account, issue } = mapAccountRow(record, index + 2);
    if (account !== undefined) {
      accounts.push(account);
    }
    if (issue !== undefined) {
      issues.push(issue);
    }
  });
  return { accounts, issues };
}

// --- People --------------------------------------------------------------------

const PERSON_ID_ALIASES = ["id", "person_id", "member_id"];
const PERSON_ACCOUNT_ALIASES = ["account_id", "account", "account_number"];

const PHONE_COLUMNS: Array<{ aliases: string[]; label: ImportedContactPoint["label"] }> = [
  { aliases: ["phone", "home_phone"], label: "home" },
  { aliases: ["mobile", "cell", "mobile_phone", "cell_phone"], label: "mobile" },
  { aliases: ["work_phone", "business_phone"], label: "work" },
  { aliases: ["fax"], label: "fax" },
];

const EMAIL_ALIASES = ["email", "primary_email", "home_email", "email_2", "secondary_email"];

export function mapPersonRow(
  record: Record<string, string>,
  rowNumber: number,
): { person?: ImportedPerson; issue?: RowIssue } {
  const consumed = new Set<string>();
  const take = consuming(record, consumed);

  const externalId = take(PERSON_ID_ALIASES);
  if (externalId === undefined) {
    return { issue: { row: rowNumber, message: "Missing person id column (id/person_id)" } };
  }
  const firstName = take(["first_name"]);
  const lastName = take(["last_name"]);
  const mailName = take(["mail_name"]);
  if (firstName === undefined && lastName === undefined && mailName === undefined) {
    return { issue: { row: rowNumber, message: `Person ${externalId} has no name columns` } };
  }

  const emails: string[] = [];
  for (const alias of EMAIL_ALIASES) {
    consumed.add(alias);
    const value = record[alias];
    if (value !== undefined && !emails.includes(value)) {
      emails.push(value);
    }
  }
  const phones: ImportedContactPoint[] = [];
  for (const column of PHONE_COLUMNS) {
    const value = consuming(record, consumed)(column.aliases);
    if (value !== undefined) {
      phones.push({ label: column.label, value });
    }
  }

  const roleLabel = take(["relationship", "role", "household_role"]);
  const isDeceased = parseImportBoolean(take(["deceased", "is_deceased"]), false);
  const person: ImportedPerson = {
    externalId,
    accountExternalId: take(PERSON_ACCOUNT_ALIASES),
    title: take(["title"]),
    firstName,
    middleName: take(["middle_name"]),
    lastName,
    nickname: take(["nickname"]),
    suffix: take(["suffix"]),
    mailName,
    personType: take(["person_type"]),
    gender: parseImportGender(take(["gender", "sex"])),
    maritalStatus: take(["marital_status"]),
    maidenName: take(["maiden_name"]),
    hebrewGivenName: take(["hebrew_name", "hebrew_first_name"]),
    hebrewFatherName: take(["fathers_hebrew_name", "hebrew_father_name"]),
    hebrewMotherName: take(["mothers_hebrew_name", "hebrew_mother_name"]),
    hebrewFamilyName: take(["hebrew_last_name", "hebrew_family_name"]),
    dateOfBirth: parseImportDate(take(["dob", "date_of_birth", "birth_date"])),
    hebrewBirthDate: take(["dob_hebrew", "hebrew_birthday", "hebrew_dob"]),
    honoraryMember: parseImportBoolean(take(["honorary_member"]), false),
    eligibleForAliyah: parseImportBoolean(
      take(["eligible_for_aliya", "eligible_for_aliyah"]),
      true,
    ),
    isDeceased,
    // Without an explicit active flag, deceased people import as inactive.
    isActive: parseImportBoolean(take(["is_active", "active"]), !isDeceased),
    memberRole: parseImportRole(roleLabel),
    sourceRoleLabel: roleLabel,
    isPrimaryContact: parseImportBoolean(take(["is_primary_contact", "primary_contact"]), false),
    memberJoinedAt: parseImportDate(take(["date_joined"])),
    memberResignedAt: parseImportDate(take(["date_resigned"])),
    emails,
    phones,
    metadata: collectUnmapped(record, consumed),
  };
  return { person };
}

export function mapPeopleCsv(text: string): { people: ImportedPerson[]; issues: RowIssue[] } {
  const people: ImportedPerson[] = [];
  const issues: RowIssue[] = [];
  let records: Record<string, string>[];
  try {
    records = csvToRecords(text);
  } catch (error) {
    return { people, issues: [fileIssue(error)] };
  }
  records.forEach((record, index) => {
    if (Object.keys(record).length === 0) {
      return;
    }
    const { person, issue } = mapPersonRow(record, index + 2);
    if (person !== undefined) {
      people.push(person);
    }
    if (issue !== undefined) {
      issues.push(issue);
    }
  });
  return { people, issues };
}

// --- Transactions --------------------------------------------------------------

/**
 * One row of the ShulCloud transactions export, mapped onto a ledger entry.
 * The export puts an amount in exactly one of two columns — `Charge` or
 * `Payment` — and overloads `Type` accordingly: it is the charge category
 * ("Donation", "Membership", …) on charge rows and the payment method
 * ("Credit Card", "Check", …) on payment rows. Negative amounts are
 * adjustments: a negative charge reduces what the household owes (a credit),
 * a negative payment is a reversed/bounced payment (owed again).
 */
export type ImportedTransaction = {
  externalId: string;
  accountExternalId: string;
  entryType: "charge" | "payment" | "credit";
  /** Always positive; the sign lives in entryType. */
  amountMinor: number;
  occurredAt: string;
  category?: string;
  method?: string;
  memo?: string;
  metadata: Record<string, string>;
};

const TRANSACTION_ID_ALIASES = ["id", "transaction_id", "txn_id"];
const TRANSACTION_ACCOUNT_ALIASES = ["account_id", "account_number"];

export function mapTransactionRow(
  record: Record<string, string>,
  rowNumber: number,
): { transaction?: ImportedTransaction; issue?: RowIssue } {
  const consumed = new Set<string>();
  const take = consuming(record, consumed);

  const externalId = take(TRANSACTION_ID_ALIASES);
  if (externalId === undefined) {
    return { issue: { row: rowNumber, message: "Missing transaction id column (id)" } };
  }
  const accountExternalId = take(TRANSACTION_ACCOUNT_ALIASES);
  if (accountExternalId === undefined) {
    return { issue: { row: rowNumber, message: `Transaction ${externalId} has no account id` } };
  }
  const occurredAt = parseImportDate(take(["date", "transaction_date", "txn_date"]));
  if (occurredAt === undefined) {
    return { issue: { row: rowNumber, message: `Transaction ${externalId} has no valid date` } };
  }

  const chargeRaw = take(["charge", "charge_amount"]);
  const paymentRaw = take(["payment", "payment_amount", "amount_paid"]);
  if (chargeRaw !== undefined && paymentRaw !== undefined) {
    return {
      issue: {
        row: rowNumber,
        message: `Transaction ${externalId} has both a charge and a payment amount`,
      },
    };
  }
  const rawAmount = chargeRaw ?? paymentRaw;
  if (rawAmount === undefined) {
    return {
      issue: {
        row: rowNumber,
        message: `Transaction ${externalId} has neither a charge nor a payment amount`,
      },
    };
  }
  const signedMinor = parseImportMoney(rawAmount);
  if (signedMinor === undefined) {
    return {
      issue: { row: rowNumber, message: `Transaction ${externalId} has an unparseable amount` },
    };
  }
  if (signedMinor === 0) {
    return { issue: { row: rowNumber, message: `Transaction ${externalId} has a zero amount` } };
  }

  const typeLabel = take(["type", "transaction_type", "charge_type"]);
  const reversalType = take(["reversal_type"]);
  const notes = take(["notes", "note", "memo"]);
  const memo = [reversalType, notes].filter((part) => part !== undefined).join(": ");

  // Redundant projections of the account row; the household already has them.
  take(["account", "account_name", "email", "member_since", "payer"]);

  const amountMinor = Math.abs(signedMinor);
  const shape =
    chargeRaw !== undefined
      ? signedMinor > 0
        ? { entryType: "charge" as const, category: typeLabel }
        : { entryType: "credit" as const, category: typeLabel }
      : signedMinor > 0
        ? { entryType: "payment" as const, method: typeLabel }
        : { entryType: "charge" as const, category: "Payment reversal", method: typeLabel };

  return {
    transaction: {
      externalId,
      accountExternalId,
      occurredAt,
      amountMinor,
      ...shape,
      memo: memo === "" ? undefined : memo,
      metadata: collectUnmapped(record, consumed),
    },
  };
}

export function mapTransactionsCsv(text: string): {
  transactions: ImportedTransaction[];
  issues: RowIssue[];
} {
  const transactions: ImportedTransaction[] = [];
  const issues: RowIssue[] = [];
  let records: Record<string, string>[];
  try {
    records = csvToRecords(text);
  } catch (error) {
    return { transactions, issues: [fileIssue(error)] };
  }
  records.forEach((record, index) => {
    if (Object.keys(record).length === 0) {
      return;
    }
    const { transaction, issue } = mapTransactionRow(record, index + 2);
    if (transaction !== undefined) {
      transactions.push(transaction);
    }
    if (issue !== undefined) {
      issues.push(issue);
    }
  });
  return { transactions, issues };
}
