/**
 * ProjectNotesPanel.tsx
 *
 * General notes panel — mounts inside any project section tab
 * (Compliance, Documents, Files, Complaints, or its own Notes tab).
 *
 * Features:
 *   - Free-text notes with rich @mention tagging
 *   - Typing "@" opens a team member picker inline
 *   - Tagged users receive an in-app + email notification
 *   - Notes are scoped to a project + optional section context
 *     (e.g. "checklist", "documents", "files", "complaints", "general")
 *   - Edit and soft-delete your own notes
 *   - Pinned notes float to the top
 *   - Admin can pin / delete any note
 *   - Full timestamp + author on every note
 *
 * Props:
 *   projectId   — current project UUID
 *   section     — context key e.g. "general" | "checklist" | "documents" | "files" | "complaints"
 *   token       — JWT access token
 *   currentUser — { id, name, role }
 *   teamMembers — list of users to @mention
 */

import React, {
  useState, useEffect, useCallback, useRef, KeyboardEvent,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamMember {
  id:   string;
  name: string;
  role: string;
}

interface NoteMention {
  userId: string;
  name:   string;
}

interface Note {
  id:        string;
  projectId: string;
  section:   string;
  body:      string;               // raw text with @[Name](userId) markers
  mentions:  NoteMention[];
  authorId:  string;
  authorName: string;
  pinned:    boolean;
  editedAt:  string | null;
  createdAt: string;
}

interface Props {
  projectId:   string;
  section:     string;
  token:       string;
  currentUser: { id: string; name: string; role: string };
  teamMembers: TeamMember[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function initials(name: string): string {
  return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
}

/**
 * Parse raw note body and render with highlighted @mentions.
 * Marker format: @[Name](userId)
 */
function renderBody(body: string): React.ReactNode[] {
  const parts  = body.split(/(@\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const match = part.match(/^@\[([^\]]+)\]\(([^)]+)\)$/);
    if (match) {
      return (
        <span key={i} style={np.mention}>@{match[1]}</span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// ─── @Mention Textarea ────────────────────────────────────────────────────────

function MentionTextarea({
  value,
  onChange,
  teamMembers,
  placeholder,
  disabled,
}: {
  value:       string;
  onChange:    (val: string) => void;
  teamMembers: TeamMember[];
  placeholder: string;
  disabled?:   boolean;
}) {
  const [mentionOpen, setMentionOpen]   = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState(0); // cursor position where @ was typed
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filteredMembers = teamMembers.filter(m =>
    m.name.toLowerCase().startsWith(mentionQuery.toLowerCase()) ||
    m.role.toLowerCase().startsWith(mentionQuery.toLowerCase())
  ).slice(0, 6);

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta     = textareaRef.current!;
    const cursor = ta.selectionStart;
    const text   = ta.value;

    // Find the last @ before cursor
    const slice  = text.slice(0, cursor);
    const atIdx  = slice.lastIndexOf("@");

    if (atIdx !== -1) {
      const fragment = slice.slice(atIdx + 1);
      // Only open if fragment has no spaces (still typing the name)
      if (!fragment.includes(" ") && !fragment.includes("\n")) {
        setMentionStart(atIdx);
        setMentionQuery(fragment);
        setMentionOpen(true);
        return;
      }
    }
    setMentionOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && (e.key === "Escape")) {
      setMentionOpen(false);
    }
  };

  const insertMention = (member: TeamMember) => {
    const ta     = textareaRef.current!;
    const text   = value;
    const before = text.slice(0, mentionStart);
    const after  = text.slice(ta.selectionStart);
    const tag    = `@[${member.name}](${member.id})`;
    const newVal = before + tag + " " + after;
    onChange(newVal);
    setMentionOpen(false);
    setMentionQuery("");
    // Restore focus and set cursor after the tag
    setTimeout(() => {
      ta.focus();
      const pos = before.length + tag.length + 1;
      ta.setSelectionRange(pos, pos);
    }, 0);
  };

  return (
    <div style={{ position: "relative" }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyUp={handleKeyUp}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={4}
        style={np.textarea}
      />
      <div style={np.mentionHint}>Type @ to tag a team member</div>

      {/* Mention picker dropdown */}
      {mentionOpen && filteredMembers.length > 0 && (
        <div style={np.mentionDropdown}>
          {filteredMembers.map(m => (
            <button
              key={m.id}
              style={np.mentionOption}
              onMouseDown={e => { e.preventDefault(); insertMention(m); }}
            >
              <span style={np.mentionAvatar}>{initials(m.name)}</span>
              <div>
                <div style={np.mentionName}>{m.name}</div>
                <div style={np.mentionRole}>{m.role}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Single Note Card ─────────────────────────────────────────────────────────

function NoteCard({
  note,
  currentUser,
  token,
  onUpdated,
}: {
  note:        Note;
  currentUser: { id: string; name: string; role: string };
  token:       string;
  onUpdated:   () => void;
}) {
  const [editing, setEditing]   = useState(false);
  const [editBody, setEditBody] = useState(note.body);
  const [saving, setSaving]     = useState(false);

  const isOwn   = note.authorId === currentUser.id;
  const isAdmin = currentUser.role === "Admin";
  const canEdit = isOwn;
  const canPin  = isAdmin;
  const canDelete = isOwn || isAdmin;

  const handleSave = async () => {
    if (!editBody.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/notes/${note.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ body: editBody }),
      });
      setEditing(false);
      onUpdated();
    } finally { setSaving(false); }
  };

  const handlePin = async () => {
    await fetch(`/api/notes/${note.id}/pin`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ pinned: !note.pinned }),
    });
    onUpdated();
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this note?")) return;
    await fetch(`/api/notes/${note.id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    onUpdated();
  };

  return (
    <div style={{ ...np.noteCard, ...(note.pinned ? np.noteCardPinned : {}) }}>
      {/* Note header */}
      <div style={np.noteHeader}>
        <div style={np.noteAuthorRow}>
          <div style={np.noteAvatar}>{initials(note.authorName)}</div>
          <div>
            <span style={np.noteAuthor}>{note.authorName}</span>
            <span style={np.noteTime}>
              {fmtRelative(note.createdAt)}
              {note.editedAt && " · edited"}
            </span>
          </div>
        </div>
        <div style={np.noteActions}>
          {note.pinned && <span style={np.pinnedTag}>📌 Pinned</span>}
          {canPin && (
            <button style={np.iconBtn} onClick={handlePin} title={note.pinned ? "Unpin" : "Pin note"}>
              {note.pinned ? "📌" : "📍"}
            </button>
          )}
          {canEdit && !editing && (
            <button style={np.iconBtn} onClick={() => { setEditBody(note.body); setEditing(true); }}>
              Edit
            </button>
          )}
          {canDelete && !editing && (
            <button style={{ ...np.iconBtn, color: "#c05050" }} onClick={handleDelete}>
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {editing ? (
        <div style={{ marginTop: 8 }}>
          <textarea
            value={editBody}
            onChange={e => setEditBody(e.target.value)}
            rows={4}
            style={np.textarea}
            autoFocus
          />
          <div style={np.editActions}>
            <button style={np.cancelBtn} onClick={() => setEditing(false)}>Cancel</button>
            <button style={np.saveBtn} onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <div style={np.noteBody}>{renderBody(note.body)}</div>
      )}

      {/* Mentions row */}
      {note.mentions.length > 0 && (
        <div style={np.mentionsList}>
          {note.mentions.map(m => (
            <span key={m.userId} style={np.mentionChip}>@{m.name}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjectNotesPanel({
  projectId, section, token, currentUser, teamMembers,
}: Props) {
  const [notes, setNotes]     = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody]       = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError]     = useState("");

  const fetchNotes = useCallback(async () => {
    try {
      const res  = await fetch(`/api/notes?projectId=${projectId}&section=${section}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setNotes(data.notes ?? []);
    } catch { /* stale */ }
    finally { setLoading(false); }
  }, [projectId, section, token]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const handlePost = async () => {
    if (!body.trim()) { setError("Note cannot be empty."); return; }
    setPosting(true); setError("");
    try {
      // Parse @[Name](userId) markers to extract mention list
      const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
      const mentions: NoteMention[] = [];
      let match;
      while ((match = mentionRegex.exec(body)) !== null) {
        if (!mentions.find(m => m.userId === match[2])) {
          mentions.push({ userId: match[2], name: match[1] });
        }
      }

      const res = await fetch("/api/notes", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ projectId, section, body, mentions }),
      });
      if (!res.ok) throw new Error("Failed to post note");
      setBody("");
      fetchNotes();
    } catch (e: any) { setError(e.message); }
    finally { setPosting(false); }
  };

  // Sort: pinned first, then by date desc
  const sorted = [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div style={np.wrap}>
      <div style={np.header}>
        <div style={np.headerLeft}>
          <h3 style={np.title}>Notes</h3>
          <span style={np.count}>{notes.length}</span>
        </div>
      </div>

      {/* Compose */}
      <div style={np.compose}>
        <div style={np.composeAvatar}>{initials(currentUser.name)}</div>
        <div style={np.composeBody}>
          <MentionTextarea
            value={body}
            onChange={setBody}
            teamMembers={teamMembers}
            placeholder={`Add a note for this ${section === "general" ? "project" : section}… Use @ to tag someone`}
          />
          {error && <div style={np.errorMsg}>{error}</div>}
          <div style={np.composeFooter}>
            <span style={np.composeHint}>
              {body.length > 0 ? `${body.length} chars` : "Shift+Enter for new line"}
            </span>
            <button
              style={{ ...np.postBtn, opacity: body.trim() ? 1 : 0.5 }}
              onClick={handlePost}
              disabled={posting || !body.trim()}
            >
              {posting ? "Posting…" : "Post note →"}
            </button>
          </div>
        </div>
      </div>

      {/* Notes list */}
      {loading ? (
        <div style={np.empty}>Loading…</div>
      ) : sorted.length === 0 ? (
        <div style={np.emptyState}>
          <div style={{ fontSize: 28, opacity: 0.2, marginBottom: 8 }}>✏</div>
          <p style={{ fontSize: 13.5, color: "#aaa", margin: 0 }}>No notes yet. Add one above.</p>
        </div>
      ) : (
        <div style={np.noteList}>
          {sorted.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              currentUser={currentUser}
              token={token}
              onUpdated={fetchNotes}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const np: Record<string, React.CSSProperties> = {
  wrap:        { fontFamily: "Satoshi, sans-serif", color: "#333" },
  header:      { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  headerLeft:  { display: "flex", alignItems: "center", gap: 8 },
  title:       { fontSize: 14, fontWeight: 700, color: "#333", margin: 0 },
  count:       { fontSize: 12, fontWeight: 600, color: "#7A8465", background: "#f0f1ec", padding: "2px 8px", borderRadius: 12 },

  compose:     { display: "flex", gap: 12, marginBottom: 20 },
  composeAvatar:{ width: 34, height: 34, background: "#7A8465", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 2 },
  composeBody: { flex: 1, minWidth: 0 },
  composeFooter:{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  composeHint: { fontSize: 11.5, color: "#bbb" },
  postBtn:     { padding: "7px 18px", background: "#7A8465", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" },

  textarea:    { width: "100%", padding: "10px 12px", border: "1px solid #e0ded8", borderRadius: 8, fontSize: 13.5, color: "#333", boxSizing: "border-box" as const, resize: "vertical" as const, fontFamily: "Satoshi, sans-serif", lineHeight: 1.6, outline: "none", background: "#fafaf8" },
  mentionHint: { fontSize: 11, color: "#ccc", marginTop: 4 },

  mentionDropdown: { position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #e0ded8", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 200, overflow: "hidden", marginTop: 4 },
  mentionOption:   { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" as const },
  mentionAvatar:   { width: 28, height: 28, background: "#7A8465", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700, flexShrink: 0 },
  mentionName:     { fontSize: 13, fontWeight: 600, color: "#333" },
  mentionRole:     { fontSize: 11, color: "#aaa" },
  mention:         { background: "#f0f1ec", color: "#7A8465", fontWeight: 600, padding: "1px 5px", borderRadius: 4, fontSize: "0.95em" },

  errorMsg:    { fontSize: 12.5, color: "#c05050", marginTop: 6 },

  noteList:    { display: "flex", flexDirection: "column" as const, gap: 10 },
  noteCard:    { background: "#fff", border: "1px solid #e8e6e0", borderRadius: 10, padding: "14px 16px" },
  noteCardPinned: { border: "1px solid #c8cabb", background: "#fafaf8", boxShadow: "0 1px 8px rgba(122,132,101,0.08)" },
  noteHeader:  { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  noteAuthorRow:{ display: "flex", alignItems: "center", gap: 10 },
  noteAvatar:  { width: 28, height: 28, background: "#DBD2C4", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 10, fontWeight: 700, flexShrink: 0 },
  noteAuthor:  { fontSize: 13, fontWeight: 700, color: "#333", display: "block" },
  noteTime:    { fontSize: 11.5, color: "#aaa", display: "block", marginTop: 1 },
  noteActions: { display: "flex", gap: 6, alignItems: "center" },
  pinnedTag:   { fontSize: 11, color: "#7A8465", fontWeight: 600 },
  iconBtn:     { background: "none", border: "none", fontSize: 12, color: "#aaa", cursor: "pointer", padding: "3px 6px", borderRadius: 5 },
  noteBody:    { fontSize: 13.5, color: "#444", lineHeight: 1.7, whiteSpace: "pre-wrap" as const },
  mentionsList:{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" as const },
  mentionChip: { fontSize: 11.5, fontWeight: 600, color: "#7A8465", background: "#f0f1ec", padding: "2px 8px", borderRadius: 12 },
  editActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  cancelBtn:   { padding: "6px 14px", border: "1px solid #e0ded8", borderRadius: 6, background: "#fff", color: "#555", fontSize: 13, cursor: "pointer" },
  saveBtn:     { padding: "6px 14px", background: "#7A8465", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  empty:       { color: "#aaa", fontSize: 13.5, padding: "16px 0" },
  emptyState:  { textAlign: "center" as const, padding: "28px", background: "#fafaf8", border: "1px dashed #e0ded8", borderRadius: 10 },
};
