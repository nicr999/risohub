// ============================================================
// RISO HUB — ChecklistEvidenceUploader.tsx
// Attach photo/file evidence to individual MCS checklist items
// ============================================================

import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';

interface EvidenceFile {
  id: number;
  note?: string;
  uploadedAt: string;
  file: { id: number; fileUrl: string; category: string };
  uploader: { id: number; name: string };
}

interface Props {
  checklistItemId: number;
  checklistItemName: string;
  projectId: number;
  readOnly?: boolean;
  onCountChange?: (count: number) => void;
}

function isImage(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
}

function isPdf(url: string): boolean {
  return /\.pdf(\?|$)/i.test(url);
}

export default function ChecklistEvidenceUploader({
  checklistItemId, checklistItemName, projectId, readOnly = false, onCountChange,
}: Props) {
  const [evidence, setEvidence] = useState<EvidenceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState('');
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadEvidence(); }, [checklistItemId]);

  async function loadEvidence() {
    setLoading(true);
    try {
      const res = await axios.get(`/api/checklist/item/${checklistItemId}/evidence`);
      setEvidence(res.data);
      onCountChange?.(res.data.length);
    } catch { setError('Failed to load evidence'); }
    finally { setLoading(false); }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError('');

    try {
      // 1. Presign
      const presign = await axios.post('/api/checklist/evidence/presign', {
        fileName: file.name, fileType: file.type, projectId,
      });

      // 2. Upload to S3
      await axios.put(presign.data.url, file, { headers: { 'Content-Type': file.type } });

      // 3. Register file record
      const fileRes = await axios.post('/api/files/upload', {
        projectId,
        fileUrl: presign.data.fileUrl,
        category: 'checklist_evidence',
        stage: 'install',
        fileName: file.name,
      });

      // 4. Attach to checklist item
      await axios.post(`/api/checklist/item/${checklistItemId}/evidence`, {
        fileId: fileRes.data.id,
        note: note.trim() || undefined,
      });

      setNote('');
      if (fileRef.current) fileRef.current.value = '';
      loadEvidence();
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteEvidence(id: number) {
    if (!confirm('Remove this evidence?')) return;
    try {
      await axios.delete(`/api/checklist/item/${checklistItemId}/evidence/${id}`);
      loadEvidence();
    } catch { setError('Failed to remove evidence'); }
  }

  async function handleSaveNote(id: number) {
    try {
      await axios.patch(`/api/checklist/item/${checklistItemId}/evidence/${id}`, { note: noteText });
      setEditingNote(null);
      loadEvidence();
    } catch { setError('Failed to update note'); }
  }

  if (loading) return <div style={s.loading}>Loading evidence…</div>;

  return (
    <div style={s.container}>
      {evidence.length === 0 && !readOnly && (
        <div style={s.emptyState}>
          <div style={s.emptyIcon}>📷</div>
          <div style={s.emptyText}>No evidence attached yet</div>
          <div style={s.emptyDesc}>Upload photos or documents to support this checklist item</div>
        </div>
      )}

      {evidence.length > 0 && (
        <div style={s.evidenceGrid}>
          {evidence.map(ev => (
            <div key={ev.id} style={s.evidenceCard}>
              {/* Thumbnail */}
              <div style={s.thumbnail}>
                {isImage(ev.file.fileUrl) ? (
                  <img src={ev.file.fileUrl} alt="Evidence" style={s.thumbImg} />
                ) : isPdf(ev.file.fileUrl) ? (
                  <div style={s.thumbDoc}>📄<span>PDF</span></div>
                ) : (
                  <div style={s.thumbDoc}>📎<span>File</span></div>
                )}
                <a href={ev.file.fileUrl} target="_blank" rel="noreferrer" style={s.thumbOverlay}>View</a>
              </div>

              {/* Note */}
              <div style={s.evidenceMeta}>
                {editingNote === ev.id ? (
                  <div style={s.noteEdit}>
                    <input
                      style={s.noteInput}
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      autoFocus
                    />
                    <div style={s.noteActions}>
                      <button style={s.saveNoteBtn} onClick={() => handleSaveNote(ev.id)}>Save</button>
                      <button style={s.cancelNoteBtn} onClick={() => setEditingNote(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div
                    style={s.noteText}
                    onClick={!readOnly ? () => { setEditingNote(ev.id); setNoteText(ev.note || ''); } : undefined}
                  >
                    {ev.note || <span style={s.addNote}>{readOnly ? '—' : '+ Add note'}</span>}
                  </div>
                )}
                <div style={s.evidenceFooter}>
                  <span style={s.uploaderName}>{ev.uploader.name}</span>
                  <span style={s.uploadDate}>{new Date(ev.uploadedAt).toLocaleDateString('en-GB')}</span>
                  {!readOnly && (
                    <button style={s.removeBtn} onClick={() => handleDeleteEvidence(ev.id)}>✕</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload area */}
      {!readOnly && (
        <div style={s.uploadSection}>
          <div style={s.noteRow}>
            <input
              style={s.noteInput}
              placeholder="Add a note for this upload (optional)…"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
          <div
            style={{ ...s.uploadDropzone, ...(uploading ? s.uploading : {}) }}
            onClick={() => !uploading && fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); }}
            onDrop={e => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file && fileRef.current) {
                const dt = new DataTransfer();
                dt.items.add(file);
                fileRef.current.files = dt.files;
                handleUpload({ target: fileRef.current } as any);
              }
            }}
          >
            {uploading ? (
              <div style={s.uploadingLabel}>Uploading…</div>
            ) : (
              <>
                <div style={s.uploadIcon}>📎</div>
                <div style={s.uploadLabel}>Click or drag to upload evidence</div>
                <div style={s.uploadHint}>Photos, PDFs, or any document</div>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" hidden onChange={handleUpload} accept="image/*,.pdf,.doc,.docx,.xlsx" />
          {error && <div style={s.error}>{error}</div>}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { fontFamily: 'Satoshi, sans-serif' },
  loading: { padding: 16, color: '#999', fontSize: 12 },
  emptyState: { textAlign: 'center', padding: '20px 0 16px' },
  emptyIcon: { fontSize: 28, marginBottom: 6 },
  emptyText: { fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 3 },
  emptyDesc: { fontSize: 12, color: '#999' },
  evidenceGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 16 },
  evidenceCard: { border: '1px solid #e8e8e4', borderRadius: 7, overflow: 'hidden', background: '#fafaf8' },
  thumbnail: { position: 'relative', height: 90, background: '#f0f0ec', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover' },
  thumbDoc: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 24, color: '#7A8465' },
  thumbOverlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0)', color: 'transparent', fontSize: 12, fontWeight: 600, textDecoration: 'none', transition: 'all 0.15s' },
  evidenceMeta: { padding: '7px 9px' },
  noteEdit: { display: 'flex', flexDirection: 'column', gap: 5 },
  noteInput: { fontSize: 12, padding: '5px 8px', border: '1px solid #ddd', borderRadius: 5, outline: 'none', width: '100%', boxSizing: 'border-box' },
  noteActions: { display: 'flex', gap: 5 },
  saveNoteBtn: { fontSize: 11, padding: '3px 8px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' },
  cancelNoteBtn: { fontSize: 11, padding: '3px 8px', background: '#fff', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' },
  noteText: { fontSize: 12, color: '#444', minHeight: 20, cursor: 'text', lineHeight: 1.4 },
  addNote: { color: '#bbb', fontStyle: 'italic' },
  evidenceFooter: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 },
  uploaderName: { fontSize: 10, color: '#888', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  uploadDate: { fontSize: 10, color: '#bbb', flexShrink: 0 },
  removeBtn: { fontSize: 10, background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', padding: '0 2px', flexShrink: 0 },
  uploadSection: { borderTop: '1px solid #f0f0ec', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  noteRow: {},
  uploadDropzone: { border: '1.5px dashed #d0d0c8', borderRadius: 7, padding: '16px 12px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s' },
  uploading: { opacity: 0.6, cursor: 'not-allowed' },
  uploadingLabel: { fontSize: 12, color: '#7A8465', fontWeight: 600 },
  uploadIcon: { fontSize: 20, marginBottom: 4 },
  uploadLabel: { fontSize: 12, color: '#666', fontWeight: 500 },
  uploadHint: { fontSize: 11, color: '#bbb', marginTop: 2 },
  error: { fontSize: 11, color: '#dc2626', marginTop: 4 },
};
