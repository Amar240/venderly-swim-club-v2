import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { AnimatePresence, m } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { api } from "../lib/api";
import { SplashBrand } from "../components/SplashBrand";

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
  | { status: "loading" }
  | { status: "success"; clubId: string; result: UploadResponse }
  | {
      status: "error";
      kind: "unprocessable" | "file" | "rate" | "generic";
      title: string;
      message: string;
      warnings: string[];
    };

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

export const Demo = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const submit = async (values: DemoFormValues): Promise<void> => {
    if (!selectedFile) {
      setFileError("Choose your member spreadsheet to continue.");
      return;
    }

    setView({ status: "loading" });

    try {
      const start = await api.post<StartResponse>("/demo/start", values);
      const formData = new FormData();
      formData.append("file", selectedFile);
      const upload = await api.post<UploadResponse>(`/demo/${start.data.demoClubId}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      setView({ status: "success", clubId: start.data.demoClubId, result: upload.data });
    } catch (error) {
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
      <main className="vld-demo-main">
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

              <form className="vld-demo-form" onSubmit={handleSubmit(submit)} noValidate>
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
                    I confirm I am authorized to upload this member list. The demo and its imported member data will
                    be permanently deleted after seven days.
                  </span>
                </label>
                {errors.authorized ? (
                  <small className="vld-consent-error" role="alert">{errors.authorized.message}</small>
                ) : null}

                <button className="vld-button vld-button-primary vld-submit-button" type="submit">
                  See my club <span aria-hidden="true">→</span>
                </button>
              </form>

              <a className="vld-guided-link" href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
                Prefer a guided tour? <span>Book a walkthrough</span>
              </a>
              <Link className="vld-back-link" to="/">
                <ArrowLeft aria-hidden="true" /> Back to home
              </Link>
            </m.section>
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
              <h1>Reading your members...</h1>
              <p>We're organizing households, membership tiers, and guest-pass balances.</p>
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
