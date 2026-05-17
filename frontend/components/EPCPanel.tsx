// ============================================================
// RISO HUB — EPCPanel.tsx
// Search, fetch, display and store EPC data for a project
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

interface EPCSearchResult {
  lmkKey: string;
  address1: string;
  address2?: string;
  posttown?: string;
  postcode: string;
  currentEnergyRating: string;
  currentEnergyEfficiency: number;
  lodgementDate: string;
  propertyType: string;
  builtForm?: string;
}

interface StoredEPC {
  id: number;
  lmkKey: string;
  address: string;
  postcode: string;
  propertyType?: string;
  builtForm?: string;
  constructionAgeBand?: string;
  totalFloorArea?: number;
  currentEnergyRating: string;
  currentEnergyEfficiency: number;
  potentialEnergyRating?: string;
  potentialEnergyEfficiency?: number;
  mainHeatingDescription?: string;
  mainFuel?: string;
  roofDescription?: string;
  roofEnergyEff?: string;
  wallDescription?: string;
  wallEnergyEff?: string;
  recommendations?: { improvement: string; indicativeCost?: string; typicalSaving?: string }[];
  lodgementDate?: string;
  fetchedAt: string;
  fetcher?: { name: string };
}

interface Props {
  projectId: number;
  postcode: string;
  readOnly?: boolean;
  onEPCStored?: (epc: StoredEPC) => void;
}

const RATING_COLOURS: Record<string, { bg: string; text: string }> = {
  A: { bg: '#00a550', text: '#fff' },
  B: { bg: '#50b848', text: '#fff' },
  C: { bg: '#aacf44', text: '#333' },
  D: { bg: '#f5d327', text: '#333' },
  E: { bg: '#f4a11d', text: '#fff' },
  F: { bg: '#ed7a1f', text: '#fff' },
  G: { bg: '#e31d23', text: '#fff' },
};

const EFF_COLOURS = ['#e31d23', '#ed7a1f', '#f4a11d', '#f5d327', '#aacf44', '#50b848', '#00a550'];

export default function EPCPanel({ projectId, postcode, readOnly = false, onEPCStored }: Props) {
  const [stored, setStored] = useState<StoredEPC | null>(null);
  const [searchResults, setSearchResults] = useState<EPCSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [storing, setStoring] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchPostcode, setSearchPostcode] = useState(postcode || '');
  const [addressFilter, setAddressFilter] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadStored = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/epc/project/${projectId}`);
      setStored(res.data);
    } catch (e: any) {
      if (e.response?.status !== 404) setError('Failed to load EPC data');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadStored(); }, [loadStored]);

  async function handleSearch() {
    if (!searchPostcode.trim()) return;
    setSearching(true); setError('');
    try {
      const res = await axios.get('/api/epc/search', {
        params: { postcode: searchPostcode, address: addressFilter || undefined },
      });
      setSearchResults(res.data.results || []);
      if (res.data.results.length === 0) setError('No EPC certificates found for this postcode.');
    } catch (e: any) {
      setError(e.response?.data?.error || 'EPC search failed');
    } finally {
      setSearching(false);
    }
  }

  async function handleStore(lmkKey: string) {
    setStoring(true); setError(''); setSuccess('');
    try {
      const res = await axios.post(`/api/epc/project/${projectId}`, { lmkKey });
      setStored(res.data);
      setSearchResults([]);
      setShowSearch(false);
      setSuccess('EPC stored successfully');
      onEPCStored?.(res.data);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to store EPC');
    } finally {
      setStoring(false);
    }
  }

  async function handleRemove() {
    if (!window.confirm('Remove the stored EPC from this project?')) return;
    try {
      await axios.delete(`/api/epc/project/${projectId}`);
      setStored(null);
      setSuccess('EPC removed');
    } catch {
      setError('Failed to remove EPC');
    }
  }

  if (loading) return <div style={s.loading}>Loading EPC data…</div>;

  return (
    <div style={s.panel}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h3 style={s.title}>Energy Performance Certificate</h3>
          <p style={s.desc}>Fetched from the UK EPC Register (epc.opendatacommunities.org)</p>
        </div>
        {!readOnly && (
          <div style={s.headerActions}>
            {stored && (
              <button style={s.removeBtn} onClick={handleRemove}>Remove</button>
            )}
            <button style={s.searchBtn} onClick={() => setShowSearch(v => !v)}>
              {showSearch ? 'Cancel' : stored ? '↺ Re-fetch' : '+ Fetch EPC'}
            </button>
          </div>
        )}
      </div>

      {(error || success) && (
        <div style={error ? s.errorBanner : s.successBanner}>{error || success}</div>
      )}

      {/* Search panel */}
      {showSearch && (
        <div style={s.searchBox}>
          <div style={s.searchRow}>
            <input
              style={s.searchInput}
              placeholder="Postcode"
              value={searchPostcode}
              onChange={e => setSearchPostcode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <input
              style={s.searchInput}
              placeholder="Address (optional)"
              value={addressFilter}
              onChange={e => setAddressFilter(e.target.value)}
            />
            <button style={s.goBtn} onClick={handleSearch} disabled={searching}>
              {searching ? '…' : 'Search'}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div style={s.resultsList}>
              {searchResults.map(r => (
                <div key={r.lmkKey} style={s.resultRow}>
                  <div style={s.resultInfo}>
                    <div style={s.resultAddress}>
                      {[r.address1, r.address2, r.posttown, r.postcode].filter(Boolean).join(', ')}
                    </div>
                    <div style={s.resultMeta}>
                      {r.propertyType}{r.builtForm ? ` · ${r.builtForm}` : ''} · Lodged {r.lodgementDate}
                    </div>
                  </div>
                  <RatingBadge rating={r.currentEnergyRating} score={r.currentEnergyEfficiency} />
                  <button
                    style={s.useBtn}
                    onClick={() => handleStore(r.lmkKey)}
                    disabled={storing}
                  >
                    {storing ? '…' : 'Use'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stored EPC display */}
      {stored && !showSearch && (
        <div style={s.epcDisplay}>
          {/* Rating hero */}
          <div style={s.ratingHero}>
            <RatingBadge rating={stored.currentEnergyRating} score={stored.currentEnergyEfficiency} large />
            <div style={s.ratingDetail}>
              <div style={s.ratingLabel}>Current EPC Rating</div>
              <EfficiencyBar score={stored.currentEnergyEfficiency} />
              {stored.potentialEnergyRating && (
                <div style={s.potential}>
                  Potential: <strong>{stored.potentialEnergyRating}</strong> ({stored.potentialEnergyEfficiency})
                </div>
              )}
            </div>
          </div>

          {/* Property details grid */}
          <div style={s.detailGrid}>
            <Detail label="Address" value={stored.address} />
            <Detail label="Property Type" value={[stored.propertyType, stored.builtForm].filter(Boolean).join(' · ')} />
            <Detail label="Floor Area" value={stored.totalFloorArea ? `${stored.totalFloorArea} m²` : undefined} />
            <Detail label="Construction" value={stored.constructionAgeBand} />
            <Detail label="Main Fuel" value={stored.mainFuel} />
            <Detail label="Main Heating" value={stored.mainHeatingDescription} />
            <Detail label="Walls" value={stored.wallDescription} suffix={stored.wallEnergyEff ? ` (${stored.wallEnergyEff})` : ''} />
            <Detail label="Roof/Loft" value={stored.roofDescription} suffix={stored.roofEnergyEff ? ` (${stored.roofEnergyEff})` : ''} />
            <Detail label="EPC Lodged" value={stored.lodgementDate ? new Date(stored.lodgementDate).toLocaleDateString('en-GB') : undefined} />
          </div>

          {/* Recommendations */}
          {stored.recommendations && stored.recommendations.length > 0 && (
            <div style={s.recsSection}>
              <div style={s.recsTitle}>Recommended Improvements</div>
              <div style={s.recsList}>
                {stored.recommendations.map((rec, i) => (
                  <div key={i} style={s.recRow}>
                    <div style={s.recImprovement}>{rec.improvement}</div>
                    <div style={s.recMeta}>
                      {rec.indicativeCost && <span>Cost: {rec.indicativeCost}</span>}
                      {rec.typicalSaving && <span style={{ marginLeft: 12 }}>Saving: {rec.typicalSaving}/yr</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={s.fetchedMeta}>
            Fetched {new Date(stored.fetchedAt).toLocaleDateString('en-GB')}
            {stored.fetcher ? ` by ${stored.fetcher.name}` : ''} · LMK: <code style={s.mono}>{stored.lmkKey}</code>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!stored && !showSearch && (
        <div style={s.empty}>
          <div style={s.emptyIcon}>📋</div>
          <div style={s.emptyText}>No EPC fetched for this project</div>
          {!readOnly && (
            <button style={s.searchBtn} onClick={() => setShowSearch(true)}>Fetch EPC from register</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function RatingBadge({ rating, score, large = false }: { rating: string; score: number; large?: boolean }) {
  const colours = RATING_COLOURS[rating.toUpperCase()] || { bg: '#ccc', text: '#333' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{
        width: large ? 56 : 36, height: large ? 56 : 36,
        borderRadius: large ? 10 : 6,
        background: colours.bg, color: colours.text,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: large ? 26 : 16,
      }}>
        {rating.toUpperCase()}
      </div>
      <div style={{ fontSize: 10, color: '#888' }}>{score}</div>
    </div>
  );
}

function EfficiencyBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const idx = Math.floor((pct / 100) * (EFF_COLOURS.length - 1));
  const colour = EFF_COLOURS[idx];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
      <div style={{ flex: 1, height: 6, background: '#f0f0ec', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: colour, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <div style={{ fontSize: 11, color: '#888', minWidth: 24 }}>{score}</div>
    </div>
  );
}

function Detail({ label, value, suffix }: { label: string; value?: string | null; suffix?: string }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 12, color: '#333' }}>{value}{suffix || ''}</div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  panel: { background: '#fff', border: '1px solid #e8e8e4', borderRadius: 8, padding: '20px 24px', marginBottom: 16, fontFamily: 'Satoshi, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title: { fontSize: 15, fontWeight: 700, color: '#333', margin: 0 },
  desc: { fontSize: 12, color: '#888', margin: '3px 0 0' },
  headerActions: { display: 'flex', gap: 8 },
  searchBtn: { fontSize: 12, padding: '6px 14px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  removeBtn: { fontSize: 12, padding: '6px 12px', background: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer' },
  searchBox: { background: '#fafaf8', border: '1px solid #e8e8e4', borderRadius: 8, padding: 16, marginBottom: 16 },
  searchRow: { display: 'flex', gap: 8, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 13, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, outline: 'none' },
  goBtn: { fontSize: 13, padding: '7px 16px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
  resultsList: { display: 'flex', flexDirection: 'column', gap: 6 },
  resultRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#fff', borderRadius: 6, border: '1px solid #e8e8e4' },
  resultInfo: { flex: 1 },
  resultAddress: { fontSize: 12, fontWeight: 600, color: '#333' },
  resultMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  useBtn: { fontSize: 11, padding: '4px 12px', background: '#7A8465', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' },
  epcDisplay: {},
  ratingHero: { display: 'flex', alignItems: 'flex-start', gap: 16, padding: '12px 0 16px', borderBottom: '1px solid #f0f0ec', marginBottom: 16 },
  ratingDetail: { flex: 1 },
  ratingLabel: { fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 },
  potential: { fontSize: 11, color: '#888', marginTop: 4 },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 20px', marginBottom: 16 },
  recsSection: { borderTop: '1px solid #f0f0ec', paddingTop: 14, marginTop: 4 },
  recsTitle: { fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' },
  recsList: { display: 'flex', flexDirection: 'column', gap: 6 },
  recRow: { padding: '7px 10px', background: '#fafaf8', borderRadius: 6, border: '1px solid #f0f0ec' },
  recImprovement: { fontSize: 12, color: '#333' },
  recMeta: { fontSize: 11, color: '#888', marginTop: 3 },
  fetchedMeta: { fontSize: 11, color: '#bbb', marginTop: 12 },
  mono: { fontFamily: 'monospace', fontSize: 10 },
  empty: { textAlign: 'center', padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  emptyIcon: { fontSize: 32 },
  emptyText: { fontSize: 13, color: '#bbb' },
  errorBanner: { background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#dc2626', marginBottom: 12 },
  successBanner: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#16a34a', marginBottom: 12 },
  loading: { padding: 24, color: '#888', fontSize: 13 },
};
