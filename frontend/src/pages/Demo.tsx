import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { AnimatePresence, m } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  TableProperties,
  Upload
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { api } from "../lib/api";
import { SplashBrand } from "../components/SplashBrand";
import { setDemoCapability } from "../lib/demoSession";

const BOOKING_URL = "https://secure.venderly.us/widget/booking/GhQmK64lJqAj3TBFaMq9";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ["csv", "xlsx", "xls"];

const demoFormSchema = z.object({
  clubName: z.string().trim().min(1, "Enter your club name").max(160, "Club name is too long"),
  contactName: z.string().trim().min(1, "Enter your name").max(120, "Name is too long"),
  email: z.string().trim().email("Enter a valid email address"),
  authorized: z.boolean().refine((value) => value, "Confirm that you are authorized to upload this file")
});

type DemoFormValues = z.infer<typeof demoFormSchema>;

type StartResponse = {
  demoClubId: string;
  prospectId: string;
  expiresAt: string;
};

type UploadResponse = {
  jobId: string;
  membershipsCreated: number;
  personsCreated: number;
  warnings: string[];
  isSample?: boolean;
};

type DemoSource = "upload" | "sample";
type EditableMappingTarget =
  | "accountHolderName"
  | "email"
  | "phone"
  | "streetAddress"
  | "city"
  | "postalCode"
  | "state"
  | "country"
  | "memberCount"
  | "guestPasses"
  | "paymentAmount"
  | "orderId"
  | "submittedAt"
  | "medicalNotes";

type MappingMethod = "fuzzy" | "structural" | "manual" | "llm";

type MappingEntry = {
  sourceColumn: string;
  targetField: string | null;
  confidence: number;
  method: MappingMethod;
  sampleValues: string[];
  editable: boolean;
  groupKey?: string;
  groupLabel?: string;
  canToggleGroup?: boolean;
};

type PreviewPerson = {
  fullName: string;
  isPrimary: boolean;
  age?: number | null;
};

type PreviewMembership = {
  accountHolderName: string;
  memberCount: number;
  guestPasses?: number | null;
  paymentAmount?: number;
  persons: PreviewPerson[];
};

type PreviewResponse = {
  mapping: MappingEntry[];
  droppedColumns: string[];
  stats: {
    totalRows: number;
    membershipsFound: number;
    peopleFound: number;
    validCount: number;
    invalidCount: number;
  };
  sampleMemberships: PreviewMembership[];
  warnings: string[];
  structure: {
    headerRowIndex: number;
    detectedBy: "auto" | "manual";
    candidateRows: Array<{ index: number; cells: string[] }>;
  };
};

type MappingOverride = {
  sourceColumn: string;
  targetField: EditableMappingTarget | null;
};

type ErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
  };
  warnings?: string[];
};

type DemoView =
  | { status: "start" }
  | { status: "loading"; source: DemoSource | "preview" | "confirm" }
  | {
      status: "review";
      clubId: string;
      prospectId: string;
      preview: PreviewResponse;
      selections: Record<string, EditableMappingTarget | null>;
      disabledGroups: string[];
      confirmError?: { message: string; warnings: string[] };
    }
  | { status: "success"; clubId: string; prospectId: string; result: UploadResponse & { isSample: boolean } }
  | {
      status: "error";
      kind: "unprocessable" | "file" | "rate" | "generic";
      title: string;
      message: string;
      warnings: string[];
    };

const DEMO_TARGET_OPTIONS: Array<{ value: EditableMappingTarget; label: string }> = [
  { value: "accountHolderName", label: "Account holder name" },
  { value: "memberCount", label: "Member count" },
  { value: "guestPasses", label: "Guest passes" },
  { value: "paymentAmount", label: "Payment amount for tier" }
];

const NON_RETAINED_TARGET_OPTIONS: Array<{ value: EditableMappingTarget; label: string }> = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "streetAddress", label: "Street address" },
  { value: "city", label: "City" },
  { value: "postalCode", label: "Postal code" },
  { value: "state", label: "State" },
  { value: "country", label: "Country" },
  { value: "orderId", label: "Order ID" },
  { value: "submittedAt", label: "Submitted date" },
  { value: "medicalNotes", label: "Medical notes" }
];

const EDITABLE_TARGET_OPTIONS = [...DEMO_TARGET_OPTIONS, ...NON_RETAINED_TARGET_OPTIONS];
const NON_RETAINED_TARGETS = new Set<EditableMappingTarget>(
  NON_RETAINED_TARGET_OPTIONS.map((option) => option.value)
);

const TARGET_LABELS: Record<string, string> = {
  accountHolderName: "Account holder name",
  email: "Email",
  phone: "Phone",
  streetAddress: "Street address",
  city: "City",
  postalCode: "Postal code",
  state: "State",
  country: "Country",
  memberCount: "Member count",
  guestPasses: "Guest passes",
  paymentAmount: "Payment amount for tier",
  orderId: "Order ID",
  submittedAt: "Submitted date",
  medicalNotes: "Medical notes",
  combinedAddress: "Combined address",
  accountHolderNamePart: "Account holder name"
};

const isEditableTarget = (value: string | null): value is EditableMappingTarget =>
  EDITABLE_TARGET_OPTIONS.some((option) => option.value === value);

const initialSelections = (preview: PreviewResponse): Record<string, EditableMappingTarget | null> =>
  preview.mapping.reduce<Record<string, EditableMappingTarget | null>>((selections, entry) => {
    if (entry.editable) {
      selections[entry.sourceColumn] = isEditableTarget(entry.targetField) ? entry.targetField : null;
    }
    return selections;
  }, {});

const fileExtension = (file: File): string => file.name.toLowerCase().split(".").pop() ?? "";

const validateFile = (file: File): string | null => {
  if (!ACCEPTED_EXTENSIONS.includes(fileExtension(file))) {
    return "Choose a CSV or Excel file (.csv, .xlsx, or .xls).";
  }

  if (file.size > MAX_FILE_SIZE) {
    return "File must be 10 MB or smaller.";
  }

  return null;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

type ReviewView = Extract<DemoView, { status: "review" }>;

const MappingBadge = ({ method, changed = false }: { method: MappingMethod; changed?: boolean }) => (
  <span className={`vld-mapping-badge vld-mapping-badge-${changed ? "manual" : method}`}>
    {changed
      ? "Manual"
      : method === "fuzzy"
        ? "Automatic"
        : method === "llm"
          ? "AI suggested"
          : "Structure"}
  </span>
);

const SampleValues = ({ values }: { values: string[] }) => (
  <div className="vld-mapping-samples">
    {values.length > 0
      ? values.map((value) => <span key={value}>{value}</span>)
      : <span>Empty column</span>}
  </div>
);

const MappingReview = ({
  review,
  onSelectionChange,
  onToggleGroup,
  onHeaderRowChange,
  headerPreviewLoading,
  onBack,
  onConfirm
}: {
  review: ReviewView;
  onSelectionChange: (sourceColumn: string, targetField: EditableMappingTarget | null) => void;
  onToggleGroup: (groupKey: string) => void;
  onHeaderRowChange: (headerRowIndex: number) => void;
  headerPreviewLoading: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) => {
  const familyGroups = new Map<string, MappingEntry[]>();
  for (const entry of review.preview.mapping) {
    if (entry.groupKey && entry.canToggleGroup) {
      familyGroups.set(entry.groupKey, [...(familyGroups.get(entry.groupKey) ?? []), entry]);
    }
  }
  const regularEntries = review.preview.mapping.filter(
    (entry) => !(entry.groupKey && entry.canToggleGroup)
  );

  return (
    <m.section
      className="vld-demo-card vld-review-card"
      key="review"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25 }}
    >
      <div className="vld-review-heading">
        <span className="vld-eyebrow"><TableProperties aria-hidden="true" /> Mapping review</span>
        <h1>Check what we understood.</h1>
        <p>
          We found <b>{review.preview.stats.membershipsFound} memberships</b> and{" "}
          <b>{review.preview.stats.peopleFound} people</b> across {review.preview.stats.totalRows} rows.
        </p>
        <p className="vld-review-privacy">
          We read your whole file. Only fields marked editable change what you see, and we do not store member
          contact or payment details in the demo.
        </p>
      </div>

      {review.confirmError ? (
        <div className="vld-review-error" role="alert">
          <AlertCircle aria-hidden="true" />
          <div>
            <b>We could not load this mapping.</b>
            <p>{review.confirmError.message}</p>
          </div>
        </div>
      ) : null}

      <details className="vld-header-review">
        <summary>
          <span>
            Reading row {review.preview.structure.headerRowIndex + 1} as your column headers
            {review.preview.structure.detectedBy === "manual" ? " (selected)" : ""}
          </span>
          <b>Not right?</b>
        </summary>
        <div className="vld-header-candidates">
          <p>Choose the row that contains the names of your spreadsheet columns.</p>
          {review.preview.structure.candidateRows.map((candidate) => {
            const selected = candidate.index === review.preview.structure.headerRowIndex;
            return (
              <button
                key={candidate.index}
                type="button"
                className={selected ? "is-selected" : undefined}
                disabled={selected || headerPreviewLoading}
                onClick={() => onHeaderRowChange(candidate.index)}
              >
                <span>Row {candidate.index + 1}</span>
                <small>{candidate.cells.length > 0 ? candidate.cells.join(" | ") : "Blank row"}</small>
                {selected ? <b>Current</b> : null}
              </button>
            );
          })}
          {headerPreviewLoading ? (
            <span className="vld-header-loading"><Loader2 aria-hidden="true" /> Reading that row...</span>
          ) : null}
        </div>
      </details>

      <div className="vld-mapping-table-wrap">
        <table className="vld-mapping-table">
          <thead>
            <tr>
              <th>Source column</th>
              <th>Sample values</th>
              <th>Read as</th>
              <th>Method</th>
            </tr>
          </thead>
          <tbody>
            {[...familyGroups.entries()].map(([groupKey, entries]) => {
              const disabled = review.disabledGroups.includes(groupKey);
              const samples = entries.flatMap((entry) => entry.sampleValues).filter(Boolean).slice(0, 3);
              return (
                <tr key={groupKey} className="vld-family-mapping-row">
                  <td>
                    <b>{entries[0]?.groupLabel ?? "Family members"}</b>
                    <small>{entries.length} related columns</small>
                  </td>
                  <td><SampleValues values={samples} /></td>
                  <td>
                    <label className="vld-family-toggle">
                      <input
                        type="checkbox"
                        checked={!disabled}
                        onChange={() => onToggleGroup(groupKey)}
                      />
                      <span>{disabled ? "Excluded" : "Include family members"}</span>
                    </label>
                  </td>
                  <td><MappingBadge method="structural" changed={disabled} /></td>
                </tr>
              );
            })}
            {regularEntries.map((entry) => {
              const selected = review.selections[entry.sourceColumn] ?? null;
              const original = isEditableTarget(entry.targetField) ? entry.targetField : null;
              const changed = entry.editable && selected !== original;
              return (
                <tr key={entry.sourceColumn}>
                  <td><b>{entry.sourceColumn || "Unnamed column"}</b></td>
                  <td><SampleValues values={entry.sampleValues} /></td>
                  <td>
                    {entry.editable ? (
                      <div className="vld-editable-mapping">
                        <select
                          value={selected ?? ""}
                          aria-label={`Map ${entry.sourceColumn}`}
                          onChange={(event) => onSelectionChange(
                            entry.sourceColumn,
                            event.target.value ? event.target.value as EditableMappingTarget : null
                          )}
                        >
                          <option value="">Ignore this column</option>
                          <optgroup label="Used to build your demo">
                            {DEMO_TARGET_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Detected for validation, not stored">
                            {NON_RETAINED_TARGET_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </optgroup>
                        </select>
                        {selected && NON_RETAINED_TARGETS.has(selected) ? (
                          <small>Detected for validation, not stored in this demo</small>
                        ) : null}
                      </div>
                    ) : entry.targetField ? (
                      <div className="vld-readonly-mapping">
                        <b>{TARGET_LABELS[entry.targetField] ?? entry.groupLabel ?? "Detected field"}</b>
                        <small>
                          {entry.targetField === "accountHolderNamePart"
                            ? "Used to build the account holder name"
                            : "Detected, not stored in this demo"}
                        </small>
                      </div>
                    ) : (
                      <span className="vld-ignored-mapping">Ignored automatically</span>
                    )}
                  </td>
                  <td><MappingBadge method={entry.method} changed={changed} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {review.preview.warnings.length > 0 || (review.confirmError?.warnings.length ?? 0) > 0 ? (
        <details className="vld-warning-list">
          <summary>
            {review.preview.warnings.length + (review.confirmError?.warnings.length ?? 0)} rows needed attention
          </summary>
          <ul>
            {[...review.preview.warnings, ...(review.confirmError?.warnings ?? [])].map((warning, index) => (
              <li key={`${index}-${warning}`}>{warning}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {review.preview.sampleMemberships.length > 0 ? (
        <div className="vld-understood-preview">
          <div className="vld-understood-heading">
            <h2>What we understood</h2>
            <p>A quick look at the first households in your file.</p>
          </div>
          <div className="vld-understood-grid">
            {review.preview.sampleMemberships.map((membership, index) => (
              <article key={`${membership.accountHolderName}-${index}`}>
                <div className="vld-understood-title">
                  <b>{membership.accountHolderName}</b>
                  <span>{membership.memberCount} in membership</span>
                </div>
                <ul>
                  {membership.persons.slice(0, 5).map((person, personIndex) => (
                    <li key={`${person.fullName}-${personIndex}`}>
                      <span>{person.fullName}</span>
                      <small>
                        {person.isPrimary ? "Primary" : "Member"}
                        {person.age !== null && person.age !== undefined ? `, age ${person.age}` : ""}
                      </small>
                    </li>
                  ))}
                </ul>
                {membership.persons.length > 5 ? (
                  <small className="vld-more-members">+{membership.persons.length - 5} more members</small>
                ) : null}
                <div className="vld-understood-meta">
                  <span>{membership.guestPasses ?? 0} guest passes</span>
                  <span>{membership.paymentAmount !== undefined ? `$${membership.paymentAmount} tier input` : "No payment tier input"}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="vld-no-preview">
          <AlertCircle aria-hidden="true" />
          <div>
            <b>No valid households yet</b>
            <p>Adjust the editable columns above, then load the file to validate your changes.</p>
          </div>
        </div>
      )}

      <div className="vld-review-actions">
        <button className="vld-button vld-button-ghost" type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" /> Back
        </button>
        <button className="vld-button vld-button-primary" type="button" onClick={onConfirm}>
          Load my club <span aria-hidden="true">→</span>
        </button>
      </div>
    </m.section>
  );
};

export const Demo = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [headerPreviewLoading, setHeaderPreviewLoading] = useState(false);
  const [view, setView] = useState<DemoView>({ status: "start" });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<DemoFormValues>({
    resolver: zodResolver(demoFormSchema),
    defaultValues: {
      clubName: "",
      contactName: "",
      email: "",
      authorized: false
    }
  });

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Live Demo | Splash Manager";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const chooseFile = (file: File | undefined): void => {
    if (!file) {
      return;
    }

    const validationError = validateFile(file);
    setFileError(validationError ?? "");
    setSelectedFile(validationError ? null : file);

    if (validationError && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const clearFile = (): void => {
    setSelectedFile(null);
    setFileError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const showRequestError = (error: unknown): void => {
    if (axios.isAxiosError<ErrorEnvelope>(error)) {
      const status = error.response?.status;
      const envelope = error.response?.data;
      const message = envelope?.error?.message;
      const warnings = Array.isArray(envelope?.warnings) ? envelope.warnings : [];

      if (status === 422) {
        setView({
          status: "error",
          kind: "unprocessable",
          title: "We couldn't find valid memberships in that file.",
          message: message ?? "Check the member names and email columns, then try another file.",
          warnings
        });
        return;
      }

      if (status === 400) {
        setView({
          status: "error",
          kind: "file",
          title: "We couldn't read that file.",
          message: message ?? "Choose a CSV or Excel file and try again.",
          warnings
        });
        return;
      }

      if (status === 429) {
        setView({
          status: "error",
          kind: "rate",
          title: "Please give us a moment.",
          message: message ?? "Too many demo requests. Wait a few minutes and try again.",
          warnings: []
        });
        return;
      }

      if (status && status >= 500) {
        setView({
          status: "error",
          kind: "generic",
          title: "The demo service is temporarily unavailable.",
          message: "We couldn't complete your request. Please wait a moment and try again.",
          warnings: []
        });
        return;
      }
    }

    setView({
      status: "error",
      kind: "generic",
      title: "Something went wrong.",
      message: "Please check your connection and try again.",
      warnings: []
    });
  };

  const submitUpload = async (values: DemoFormValues): Promise<void> => {
    if (!selectedFile) {
      setFileError("Choose your member spreadsheet to continue.");
      return;
    }

    setView({ status: "loading", source: "preview" });

    try {
      const start = await api.post<StartResponse>("/demo/start", values);
      setDemoCapability({ demoClubId: start.data.demoClubId, prospectId: start.data.prospectId });
      const formData = new FormData();
      formData.append("file", selectedFile);
      const preview = await api.post<PreviewResponse>(`/demo/${start.data.demoClubId}/preview`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      setView({
        status: "review",
        clubId: start.data.demoClubId,
        prospectId: start.data.prospectId,
        preview: preview.data,
        selections: initialSelections(preview.data),
        disabledGroups: []
      });
    } catch (error) {
      showRequestError(error);
    }
  };

  const submitSample = async (values: DemoFormValues): Promise<void> => {
    setView({ status: "loading", source: "sample" });

    try {
      const start = await api.post<StartResponse>("/demo/start", values);
      setDemoCapability({ demoClubId: start.data.demoClubId, prospectId: start.data.prospectId });
      const sample = await api.post<UploadResponse>(`/demo/${start.data.demoClubId}/sample`);
      setView({
        status: "success",
        clubId: start.data.demoClubId,
        prospectId: start.data.prospectId,
        result: { ...sample.data, isSample: true }
      });
    } catch (error) {
      showRequestError(error);
    }
  };

  const updateSelection = (sourceColumn: string, targetField: EditableMappingTarget | null): void => {
    setView((current) => {
      if (current.status !== "review") {
        return current;
      }

      const selections = { ...current.selections };
      if (targetField) {
        for (const [source, selectedTarget] of Object.entries(selections)) {
          if (source !== sourceColumn && selectedTarget === targetField) {
            selections[source] = null;
          }
        }
      }
      selections[sourceColumn] = targetField;
      return { ...current, selections, confirmError: undefined };
    });
  };

  const toggleFamilyGroup = (groupKey: string): void => {
    setView((current) => {
      if (current.status !== "review") {
        return current;
      }
      const disabledGroups = current.disabledGroups.includes(groupKey)
        ? current.disabledGroups.filter((key) => key !== groupKey)
        : [...current.disabledGroups, groupKey];
      return { ...current, disabledGroups, confirmError: undefined };
    });
  };

  const selectHeaderRow = async (headerRowIndex: number): Promise<void> => {
    if (view.status !== "review" || !selectedFile || headerPreviewLoading) {
      return;
    }

    const previousReview = view;
    setHeaderPreviewLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("headerRowIndex", String(headerRowIndex));
      const preview = await api.post<PreviewResponse>(`/demo/${view.clubId}/preview`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setView({
        status: "review",
        clubId: view.clubId,
        prospectId: view.prospectId,
        preview: preview.data,
        selections: initialSelections(preview.data),
        disabledGroups: []
      });
    } catch (error) {
      const message = axios.isAxiosError<ErrorEnvelope>(error)
        ? error.response?.data?.error?.message ?? "We could not read that header row."
        : "We could not read that header row.";
      setView({
        ...previousReview,
        confirmError: { message, warnings: [] }
      });
    } finally {
      setHeaderPreviewLoading(false);
    }
  };

  const confirmUpload = async (): Promise<void> => {
    if (view.status !== "review" || !selectedFile) {
      setView({
        status: "error",
        kind: "file",
        title: "Choose your file again.",
        message: "The selected spreadsheet is no longer available in this browser.",
        warnings: []
      });
      return;
    }

    const review = view;
    const overrides: MappingOverride[] = [];
    for (const entry of review.preview.mapping) {
      if (entry.editable) {
        const selected = review.selections[entry.sourceColumn] ?? null;
        overrides.push({ sourceColumn: entry.sourceColumn, targetField: selected });
      }

      if (entry.groupKey && entry.canToggleGroup && review.disabledGroups.includes(entry.groupKey)) {
        overrides.push({ sourceColumn: entry.sourceColumn, targetField: null });
      }
    }

    setView({ status: "loading", source: "confirm" });

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("mappingOverrides", JSON.stringify(overrides));
      formData.append("headerRowIndex", String(review.preview.structure.headerRowIndex));
      const upload = await api.post<UploadResponse>(`/demo/${review.clubId}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setView({
        status: "success",
        clubId: review.clubId,
        prospectId: review.prospectId,
        result: { ...upload.data, isSample: false }
      });
    } catch (error) {
      if (axios.isAxiosError<ErrorEnvelope>(error) && [400, 422].includes(error.response?.status ?? 0)) {
        setView({
          ...review,
          confirmError: {
            message: error.response?.data?.error?.message ?? "Review the mapping and try again.",
            warnings: Array.isArray(error.response?.data?.warnings) ? error.response.data.warnings : []
          }
        });
        return;
      }
      showRequestError(error);
    }
  };

  const retry = (): void => {
    if (view.status === "error" && view.kind !== "generic") {
      clearFile();
    }
    setView({ status: "start" });
  };

  return (
    <div className="vld vld-demo-page">
      <div className="vld-grid-bg" aria-hidden="true" />
      <main className={`vld-demo-main${view.status === "review" ? " vld-demo-main-review" : ""}`}>
        <SplashBrand />
        <AnimatePresence mode="wait" initial={false}>
          {view.status === "start" ? (
            <m.section
              className="vld-demo-card vld-upload-card"
              key="start"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <span className="vld-eyebrow">Live demo</span>
              <h1>See your club come alive.</h1>
              <p>Tell us where to send your demo, then drop in the member list you already have.</p>

              <form className="vld-demo-form" onSubmit={handleSubmit(submitUpload)} noValidate>
                <div className="vld-form-grid">
                  <label className="vld-field vld-field-wide">
                    <span>Club name</span>
                    <input type="text" autoComplete="organization" {...register("clubName")} />
                    {errors.clubName ? <small role="alert">{errors.clubName.message}</small> : null}
                  </label>
                  <label className="vld-field">
                    <span>Your name</span>
                    <input type="text" autoComplete="name" {...register("contactName")} />
                    {errors.contactName ? <small role="alert">{errors.contactName.message}</small> : null}
                  </label>
                  <label className="vld-field">
                    <span>Email</span>
                    <input type="email" autoComplete="email" {...register("email")} />
                    {errors.email ? <small role="alert">{errors.email.message}</small> : null}
                  </label>
                </div>

                <div className="vld-file-field">
                  <span className="vld-file-label">Member spreadsheet</span>
                  <button
                    type="button"
                    className={`vld-dropzone${isDragging ? " vld-dropzone-dragging" : ""}${selectedFile ? " vld-dropzone-selected" : ""}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={(event) => {
                      event.preventDefault();
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setIsDragging(false);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setIsDragging(false);
                      chooseFile(event.dataTransfer.files[0]);
                    }}
                    aria-describedby={fileError ? "demo-file-error" : "demo-file-help"}
                  >
                    {selectedFile ? (
                      <>
                        <FileSpreadsheet aria-hidden="true" />
                        <span className="vld-dropzone-copy">
                          <b>{selectedFile.name}</b>
                          <small>{formatFileSize(selectedFile.size)} · Ready to upload</small>
                        </span>
                      </>
                    ) : (
                      <>
                        <Upload aria-hidden="true" />
                        <span className="vld-dropzone-copy">
                          <b>Drop your file here, or click to browse</b>
                          <small id="demo-file-help">CSV or Excel · 10 MB maximum</small>
                        </span>
                      </>
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    className="vld-visually-hidden"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    tabIndex={-1}
                    onChange={(event) => chooseFile(event.target.files?.[0])}
                  />
                  {fileError ? (
                    <small className="vld-file-error" id="demo-file-error" role="alert">
                      {fileError}
                    </small>
                  ) : null}
                  <p className="vld-file-helper">
                    Accepted formats: CSV or Excel (.csv, .xlsx). Using Apple Numbers? In Numbers choose File,
                    Export To, CSV, then upload that.
                  </p>
                </div>

                <label className="vld-consent">
                  <input type="checkbox" {...register("authorized")} />
                  <span>
                    I understand that any member list I upload must be authorized. The demo and its imported member
                    data will be permanently deleted after seven days.
                  </span>
                </label>
                {errors.authorized ? (
                  <small className="vld-consent-error" role="alert">{errors.authorized.message}</small>
                ) : null}

                <button className="vld-button vld-button-primary vld-submit-button" type="submit">
                  See my club <span aria-hidden="true">→</span>
                </button>
              </form>

              <div className="vld-sample-option">
                <span className="vld-sample-divider" aria-hidden="true">or</span>
                <button
                  className="vld-button vld-button-ghost vld-sample-button"
                  type="button"
                  onClick={() => void handleSubmit(submitSample)()}
                >
                  <Sparkles aria-hidden="true" /> No member list handy? Try it with sample data
                </button>
              </div>

              <a className="vld-guided-link" href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
                Prefer a guided tour? <span>Book a walkthrough</span>
              </a>
              <Link className="vld-back-link" to="/">
                <ArrowLeft aria-hidden="true" /> Back to home
              </Link>
            </m.section>
          ) : null}

          {view.status === "review" ? (
            <MappingReview
              review={view}
              onSelectionChange={updateSelection}
              onToggleGroup={toggleFamilyGroup}
              onHeaderRowChange={(index) => void selectHeaderRow(index)}
              headerPreviewLoading={headerPreviewLoading}
              onBack={() => setView({ status: "start" })}
              onConfirm={() => void confirmUpload()}
            />
          ) : null}

          {view.status === "loading" ? (
            <m.section
              className="vld-demo-card vld-state-card"
              key="loading"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              aria-live="polite"
            >
              <div className="vld-state-icon vld-state-icon-loading">
                <Loader2 aria-hidden="true" />
              </div>
              <h1>
                {view.source === "sample"
                  ? "Building your sample club..."
                  : view.source === "confirm"
                    ? "Loading your club..."
                    : "Reading your members..."}
              </h1>
              <p>
                {view.source === "sample"
                  ? "We're loading fictional households, membership tiers, and guest-pass balances."
                  : view.source === "confirm"
                    ? "We're applying your mapping and creating the live demo dashboard."
                    : "We're organizing households, membership tiers, and guest-pass balances."}
              </p>
            </m.section>
          ) : null}

          {view.status === "success" ? (
            <m.section
              className="vld-demo-card vld-state-card"
              key="success"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              aria-live="polite"
            >
              <div className="vld-state-icon vld-state-icon-success">
                <CheckCircle2 aria-hidden="true" />
              </div>
              <h1>Your club is loaded.</h1>
              <p>Your private seven-day demo is ready. Contact details, addresses, and medical notes were not retained.</p>
              {view.result.isSample ? (
                <p className="vld-sample-note">
                  This is sample data. Upload your own member file any time to see your real club.
                </p>
              ) : null}
              <div className="vld-result-stats">
                <div>
                  <b>{view.result.membershipsCreated}</b>
                  <span>memberships</span>
                </div>
                <div>
                  <b>{view.result.personsCreated}</b>
                  <span>total members</span>
                </div>
              </div>
              {view.result.warnings.length > 0 ? (
                <details className="vld-warning-list">
                  <summary>{view.result.warnings.length} rows needed attention</summary>
                  <ul>
                    {view.result.warnings.map((warning, index) => (
                      <li key={`${index}-${warning}`}>{warning}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <Link
                className="vld-button vld-button-primary vld-dashboard-button"
                to={`/demo/${view.clubId}/dashboard`}
              >
                Explore your dashboard <span aria-hidden="true">→</span>
              </Link>
              <Link className="vld-back-link vld-state-back" to="/">
                <ArrowLeft aria-hidden="true" /> Back to home
              </Link>
            </m.section>
          ) : null}

          {view.status === "error" ? (
            <m.section
              className="vld-demo-card vld-state-card"
              key="error"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              aria-live="assertive"
            >
              <div className="vld-state-icon vld-state-icon-error">
                <AlertCircle aria-hidden="true" />
              </div>
              <h1>{view.title}</h1>
              <p>{view.message}</p>
              {view.warnings.length > 0 ? (
                <details className="vld-warning-list" open>
                  <summary>{view.warnings.length} rows needed attention</summary>
                  <ul>
                    {view.warnings.map((warning, index) => (
                      <li key={`${index}-${warning}`}>{warning}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <button className="vld-button vld-button-primary vld-error-button" type="button" onClick={retry}>
                {view.kind === "unprocessable" ? "Try another file" : "Try again"}
              </button>
              {view.kind === "unprocessable" || view.kind === "file" ? (
                <a className="vld-guided-link" href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
                  Need help with your export? <span>Book a walkthrough</span>
                </a>
              ) : null}
            </m.section>
          ) : null}
        </AnimatePresence>
      </main>
    </div>
  );
};
