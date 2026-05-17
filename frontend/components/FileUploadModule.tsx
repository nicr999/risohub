import { useState, useRef, useCallback, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage = "survey" | "install" | "commission" | "design";
type FileCategory =
  | "heat_loss"
  | "site_photo"
  | "epc"
  | "risk_assessment"
  | "manual"
  | "other";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  stage: Stage;
  category: FileCategory;
  fileUrl: string;
  uploadedAt: Date;
  uploadedBy: string;
  mimeType: string;
}

interface UploadingFile {
  id: string;
  file: File;
  stage: Stage;
  category: FileCategory;
  progress: number; // 0–100
  status: "uploading" | "done" | "error";
  error?: string;
}

interface FileUploadModuleProps {
  projectId: string;
  projectName: string;
  currentStage: Stage;
  currentUserId: string;
  currentUserName: string;
  /** Called after a successful S3 upload + DB record creation */
  onFileUploaded?: (file: UploadedFile) => void;
  /** Called when a file is deleted */
  onFileDeleted?: (fileId: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<Stage, string> = {
  survey: "Survey",
  install: "Install",
  commission: "Commission",
  design: "Design",
};

const CATEGORY_LABELS: Record<FileCategory, string> = {
  heat_loss: "Heat loss calc",
  site_photo: "Site photo",
  epc: "EPC certificate",
  risk_assessment: "Risk assessment",
  manual: "Manual",
  other: "Other",
};

const ACCEPTED_TYPES =
  ".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.csv,.dwg,.heic,.webp";

const MAX_FILE_SIZE_MB = 50;

// ─── API helpers (swap these for real axios/fetch calls) ──────────────────────

interface PresignResponse {
  uploadUrl: string; // S3 presigned PUT URL
  fileUrl: string;   // Final public/S3 object URL
}

async function getPresignedUrl(
  projectId: string,
  fileName: string,
  contentType: string
): Promise<PresignResponse> {
  const res = await fetch("/api/files/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, fileName, contentType }),
  });
  if (!res.ok) throw new Error("Failed to get upload URL");
  return res.json();
}

async function putFileToS3(
  uploadUrl: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status === 200 ? resolve() : reject(new Error(`S3 error ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

async function createFileRecord(payload: {
  projectId: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  stage: Stage;
  category: FileCategory;
  uploadedBy: string;
}): Promise<UploadedFile> {
  const res = await fetch("/api/files/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to save file record");
  return res.json();
}

async function fetchProjectFiles(projectId: string): Promise<UploadedFile[]> {
  const res = await fetch(`/api/files?projectId=${projectId}`);
  if (!res.ok) throw new Error("Failed to fetch files");
  const data = await res.json();
  // Normalise date strings → Date objects
  return data.map((f: UploadedFile & { uploadedAt: string }) => ({
    ...f,
    uploadedAt: new Date(f.uploadedAt),
  }));
}

async function deleteFileRecord(fileId: string): Promise<void> {
  const res = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete file");
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 86400000) return "Today";
  if (diff < 172800000) return "Yesterday";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function mimeToIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "📷";
  if (mimeType === "application/pdf") return "📄";
  if (mimeType.includes("word") || mimeType.includes("document")) return "📝";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "📊";
  if (mimeType.includes("csv")) return "📋";
  return "📁";
}

function stageColor(stage: Stage): { bg: string; text: string } {
  const map: Record<Stage, { bg: string; text: string }> = {
    survey: { bg: "#f0f1ec", text: "#5a6348" },
    install: { bg: "#e8edf5", text: "#3a5a8a" },
    commission: { bg: "#e8f5f0", text: "#2a7a5a" },
    design: { bg: "#f5f0e8", text: "#8a6a2a" },
  };
  return map[stage];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressRow({ item }: { item: UploadingFile }) {
  return (
    <div style={styles.progressItem}>
      <div style={{ fontSize: 22 }}>{mimeToIcon(item.file.type)}</div>
      <div style={styles.progressMeta}>
        <div style={styles.fileName}>{item.file.name}</div>
        <div style={styles.fileSize}>{formatBytes(item.file.size)}</div>
      </div>
      <div style={styles.barWrap}>
        <div style={styles.barTrack}>
          <div
            style={{
              ...styles.barFill,
              width: `${item.progress}%`,
              background:
                item.status === "error"
                  ? "#b03030"
                  : item.status === "done"
                  ? "#5a7a48"
                  : "#7A8465",
            }}
          />
        </div>
      </div>
      <span
        style={{
          ...styles.chip,
          background:
            item.status === "error"
              ? "#fce8e8"
              : item.status === "done"
              ? "#e6f2e8"
              : "#f0f1ec",
          color:
            item.status === "error"
              ? "#b03030"
              : item.status === "done"
              ? "#3a7a43"
              : "#7A8465",
        }}
      >
        {item.status === "uploading"
          ? `${item.progress}%`
          : item.status === "done"
          ? "Done ✓"
          : "Error"}
      </span>
    </div>
  );
}

function FileRow({
  file,
  onDelete,
}: {
  file: UploadedFile;
  onDelete: (id: string) => void;
}) {
  const sc = stageColor(file.stage);
  return (
    <div style={styles.fileRow}>
      <div style={{ fontSize: 18, width: 32, textAlign: "center" }}>
        {mimeToIcon(file.mimeType)}
      </div>
      <div style={styles.fileMeta}>
        <a
          href={file.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.fileLink}
        >
          {file.name}
        </a>
        <div style={styles.fileSize}>{formatBytes(file.size)}</div>
      </div>
      <span style={{ ...styles.stageBadge, background: sc.bg, color: sc.text }}>
        {STAGE_LABELS[file.stage]}
      </span>
      <span style={styles.categoryTag}>{CATEGORY_LABELS[file.category]}</span>
      <span style={styles.dateLabel}>{formatDate(file.uploadedAt)}</span>
      <button
        onClick={() => onDelete(file.id)}
        style={styles.deleteBtn}
        title="Delete file"
        aria-label="Delete file"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FileUploadModule({
  projectId,
  projectName,
  currentStage,
  currentUserId,
  currentUserName,
  onFileUploaded,
  onFileDeleted,
}: FileUploadModuleProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [filterStage, setFilterStage] = useState<Stage | "all">("all");
  const [selectedStage, setSelectedStage] = useState<Stage>(currentStage);
  const [selectedCategory, setSelectedCategory] = useState<FileCategory>("other");
  const [isDragOver, setIsDragOver] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing files on mount
  useEffect(() => {
    fetchProjectFiles(projectId)
      .then(setUploadedFiles)
      .catch(() => setError("Could not load files. Check your connection."))
      .finally(() => setLoadingFiles(false));
  }, [projectId]);

  // Remove completed upload rows after a short delay
  useEffect(() => {
    const done = uploading.filter((u) => u.status === "done" || u.status === "error");
    if (done.length === 0) return;
    const timer = setTimeout(() => {
      setUploading((prev) => prev.filter((u) => u.status === "uploading"));
    }, 2000);
    return () => clearTimeout(timer);
  }, [uploading]);

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArr = Array.from(files);

      // Validate
      const oversized = fileArr.filter(
        (f) => f.size > MAX_FILE_SIZE_MB * 1024 * 1024
      );
      if (oversized.length) {
        setError(
          `${oversized.map((f) => f.name).join(", ")} exceed ${MAX_FILE_SIZE_MB}MB limit.`
        );
        return;
      }
      setError(null);

      // Create uploading placeholders
      const newUploading: UploadingFile[] = fileArr.map((file) => ({
        id: `${Date.now()}-${Math.random()}`,
        file,
        stage: selectedStage,
        category: selectedCategory,
        progress: 0,
        status: "uploading",
      }));

      setUploading((prev) => [...prev, ...newUploading]);

      // Upload each file
      await Promise.allSettled(
        newUploading.map(async (item) => {
          try {
            // 1. Get presigned URL
            const { uploadUrl, fileUrl } = await getPresignedUrl(
              projectId,
              item.file.name,
              item.file.type || "application/octet-stream"
            );

            // 2. Stream to S3
            await putFileToS3(uploadUrl, item.file, (pct) => {
              setUploading((prev) =>
                prev.map((u) => (u.id === item.id ? { ...u, progress: pct } : u))
              );
            });

            // 3. Save metadata
            const savedFile = await createFileRecord({
              projectId,
              fileUrl,
              fileName: item.file.name,
              fileSize: item.file.size,
              mimeType: item.file.type || "application/octet-stream",
              stage: item.stage,
              category: item.category,
              uploadedBy: currentUserId,
            });

            // 4. Update state
            setUploading((prev) =>
              prev.map((u) =>
                u.id === item.id ? { ...u, progress: 100, status: "done" } : u
              )
            );
            setUploadedFiles((prev) => [
              { ...savedFile, uploadedAt: new Date(savedFile.uploadedAt) },
              ...prev,
            ]);
            onFileUploaded?.(savedFile);
          } catch (err) {
            setUploading((prev) =>
              prev.map((u) =>
                u.id === item.id
                  ? { ...u, status: "error", error: (err as Error).message }
                  : u
              )
            );
          }
        })
      );
    },
    [projectId, selectedStage, selectedCategory, currentUserId, onFileUploaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const handleDelete = useCallback(
    async (fileId: string) => {
      if (!window.confirm("Remove this file from the project?")) return;
      try {
        await deleteFileRecord(fileId);
        setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
        onFileDeleted?.(fileId);
      } catch {
        setError("Could not delete file. Try again.");
      }
    },
    [onFileDeleted]
  );

  const filteredFiles =
    filterStage === "all"
      ? uploadedFiles
      : uploadedFiles.filter((f) => f.stage === filterStage);

  return (
    <div style={styles.wrap}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>RH</div>
          <span style={styles.headerTitle}>File Upload</span>
        </div>
        <span style={styles.projectTag}>📁 {projectName}</span>
      </div>

      <div style={styles.body}>
        {/* Error banner */}
        {error && (
          <div style={styles.errorBanner}>
            <span>⚠ {error}</span>
            <button onClick={() => setError(null)} style={styles.errorClose}>✕</button>
          </div>
        )}

        {/* Stage filter tabs */}
        <div style={styles.filterRow}>
          {(["all", "survey", "install", "commission", "design"] as const).map(
            (s) => (
              <button
                key={s}
                onClick={() => setFilterStage(s)}
                style={{
                  ...styles.filterBtn,
                  ...(filterStage === s ? styles.filterBtnActive : {}),
                }}
              >
                {s === "all" ? "All files" : STAGE_LABELS[s]}
              </button>
            )
          )}
          <span style={styles.fileCount}>{filteredFiles.length} file{filteredFiles.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Drop zone */}
        <div
          style={{
            ...styles.dropZone,
            ...(isDragOver ? styles.dropZoneActive : {}),
          }}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Upload files"
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
        >
          <div style={styles.dropIcon}>⬆</div>
          <div style={styles.dropTitle}>Drop files here to upload</div>
          <div style={styles.dropSub}>
            PDF, JPG, PNG, DOCX, XLSX, CSV · max {MAX_FILE_SIZE_MB}MB each
          </div>

          {/* Tag selectors — stop click propagation so they don't open file picker */}
          <div
            style={styles.tagRow}
            onClick={(e) => e.stopPropagation()}
          >
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value as Stage)}
              style={styles.select}
            >
              {(Object.keys(STAGE_LABELS) as Stage[]).map((s) => (
                <option key={s} value={s}>
                  Stage: {STAGE_LABELS[s]}
                </option>
              ))}
            </select>

            <select
              value={selectedCategory}
              onChange={(e) =>
                setSelectedCategory(e.target.value as FileCategory)
              }
              style={styles.select}
            >
              {(Object.keys(CATEGORY_LABELS) as FileCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>

            <button
              onClick={() => fileInputRef.current?.click()}
              style={styles.uploadBtn}
            >
              + Add files
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES}
          style={{ display: "none" }}
          onChange={(e) => e.target.files && processFiles(e.target.files)}
        />

        {/* In-progress uploads */}
        {uploading.length > 0 && (
          <div style={styles.progressList}>
            {uploading.map((item) => (
              <ProgressRow key={item.id} item={item} />
            ))}
          </div>
        )}

        {/* File library */}
        <div>
          <div style={styles.sectionLabel}>
            Uploaded evidence
            <span style={styles.countBadge}>{filteredFiles.length}</span>
          </div>

          <div style={styles.fileGrid}>
            {/* Header row */}
            <div style={{ ...styles.fileRow, ...styles.fileRowHeader }}>
              <div style={{ width: 32 }} />
              <div style={{ flex: 1 }}>File</div>
              <div style={{ width: 90 }}>Stage</div>
              <div style={{ width: 110 }}>Type</div>
              <div style={{ width: 70 }}>Date</div>
              <div style={{ width: 32 }} />
            </div>

            {loadingFiles ? (
              <div style={styles.empty}>Loading files…</div>
            ) : filteredFiles.length === 0 ? (
              <div style={styles.empty}>
                No files uploaded for this stage yet.
              </div>
            ) : (
              filteredFiles.map((f) => (
                <FileRow key={f.id} file={f} onDelete={handleDelete} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// Using plain JS objects so the component ships with zero CSS dependencies.
// Swap for CSS modules or Tailwind as preferred.

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    fontFamily: "'Satoshi', sans-serif",
    background: "#F5F5F2",
    color: "#333333",
    minHeight: 600,
    borderRadius: 12,
    overflow: "hidden",
  },
  header: {
    background: "#fff",
    borderBottom: "1px solid #DBD2C4",
    padding: "14px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  logo: {
    width: 32, height: 32,
    background: "#7A8465",
    borderRadius: 6,
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontWeight: 700, fontSize: 11,
  },
  headerTitle: { fontSize: 14, fontWeight: 700, color: "#333" },
  projectTag: {
    fontSize: 12, color: "#7A8465",
    background: "#f0f1ec",
    padding: "4px 12px",
    borderRadius: 20, fontWeight: 500,
  },
  body: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 },
  errorBanner: {
    background: "#fce8e8", color: "#b03030",
    borderRadius: 8, padding: "10px 14px",
    fontSize: 13, display: "flex",
    alignItems: "center", justifyContent: "space-between",
  },
  errorClose: {
    background: "none", border: "none",
    color: "#b03030", cursor: "pointer", fontSize: 14,
  },
  filterRow: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  filterBtn: {
    fontFamily: "'Satoshi', sans-serif",
    fontSize: 12, fontWeight: 500,
    padding: "5px 14px",
    borderRadius: 20,
    border: "1px solid #C9C8BE",
    background: "#fff", color: "#333",
    cursor: "pointer",
  },
  filterBtnActive: {
    background: "#7A8465", color: "#fff", borderColor: "#7A8465",
  },
  fileCount: { fontSize: 12, color: "#aaa", marginLeft: "auto" },
  dropZone: {
    border: "2px dashed #C9C8BE",
    borderRadius: 12, background: "#fff",
    padding: "36px 24px", textAlign: "center",
    cursor: "pointer", transition: "all 0.2s",
  },
  dropZoneActive: { borderColor: "#7A8465", background: "#f0f1ec" },
  dropIcon: {
    width: 44, height: 44,
    background: "#f0f1ec",
    borderRadius: 10,
    display: "flex", alignItems: "center", justifyContent: "center",
    margin: "0 auto 12px",
    fontSize: 20,
  },
  dropTitle: { fontSize: 14, fontWeight: 700, color: "#333", marginBottom: 4 },
  dropSub: { fontSize: 12, color: "#888" },
  tagRow: {
    display: "flex", gap: 8,
    justifyContent: "center",
    marginTop: 16, flexWrap: "wrap",
  },
  select: {
    fontFamily: "'Satoshi', sans-serif",
    fontSize: 12, fontWeight: 500,
    padding: "5px 10px",
    borderRadius: 6,
    border: "1px solid #DBD2C4",
    background: "#fff", color: "#333",
    cursor: "pointer",
  },
  uploadBtn: {
    fontFamily: "'Satoshi', sans-serif",
    fontSize: 12, fontWeight: 700,
    padding: "6px 16px",
    borderRadius: 6, border: "none",
    background: "#7A8465", color: "#fff",
    cursor: "pointer",
  },
  progressList: { display: "flex", flexDirection: "column", gap: 8 },
  progressItem: {
    background: "#fff",
    borderRadius: 10,
    border: "1px solid #DBD2C4",
    padding: "12px 16px",
    display: "flex", alignItems: "center", gap: 12,
  },
  progressMeta: { flex: 1, minWidth: 0 },
  barWrap: { flex: 1 },
  barTrack: {
    height: 4, background: "#f0f1ec",
    borderRadius: 2, overflow: "hidden",
  },
  barFill: {
    height: "100%", borderRadius: 2,
    transition: "width 0.2s ease",
  },
  chip: {
    fontSize: 11, fontWeight: 500,
    padding: "3px 8px", borderRadius: 20,
    flexShrink: 0,
  },
  sectionLabel: {
    fontSize: 12, fontWeight: 700, color: "#888",
    textTransform: "uppercase", letterSpacing: "0.06em",
    marginBottom: 6,
    display: "flex", alignItems: "center", gap: 6,
  },
  countBadge: {
    background: "#7A8465", color: "#fff",
    fontSize: 10, fontWeight: 700,
    width: 18, height: 18, borderRadius: "50%",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  },
  fileGrid: {
    background: "#fff",
    borderRadius: 12,
    border: "1px solid #DBD2C4",
    overflow: "hidden",
  },
  fileRow: {
    display: "grid",
    gridTemplateColumns: "36px 1fr 90px 110px 70px 32px",
    alignItems: "center",
    gap: 12, padding: "11px 16px",
    borderBottom: "1px solid #f0f1ec",
  },
  fileRowHeader: {
    fontSize: 11, fontWeight: 700,
    color: "#888",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    background: "#F5F5F2",
    borderBottom: "1px solid #DBD2C4",
    padding: "9px 16px",
  },
  fileMeta: { minWidth: 0 },
  fileName: {
    fontSize: 13, fontWeight: 500, color: "#333",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  fileLink: {
    fontSize: 13, fontWeight: 500, color: "#333",
    textDecoration: "none",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    display: "block",
  },
  fileSize: { fontSize: 11, color: "#aaa", marginTop: 2 },
  stageBadge: {
    fontSize: 10, fontWeight: 700,
    padding: "2px 7px", borderRadius: 10,
  },
  categoryTag: {
    fontSize: 10, fontWeight: 500,
    color: "#888", background: "#f5f5f2",
    padding: "2px 6px", borderRadius: 4,
  },
  dateLabel: { fontSize: 11, color: "#aaa" },
  deleteBtn: {
    background: "none", border: "none",
    cursor: "pointer", color: "#ccc",
    fontSize: 13, padding: 4, borderRadius: 4,
    transition: "color 0.15s",
  },
  empty: {
    textAlign: "center", padding: 32,
    color: "#aaa", fontSize: 13,
  },
};
