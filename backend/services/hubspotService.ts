/**
 * hubspotService.ts
 *
 * HubSpot Private App integration — pull only.
 * Authenticates via a single HUBSPOT_ACCESS_TOKEN env var.
 * No OAuth, no deal writeback.
 *
 * HubSpot API v3 reference:
 * https://developers.hubspot.com/docs/api/crm/contacts
 */

const BASE_URL = 'https://api.hubapi.com';

function getToken(): string {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN is not set');
  return token;
}

function headers() {
  return {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  };
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface HubSpotContact {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  company: string | null;
  // Raw HubSpot properties preserved for reference
  raw: Record<string, string | null>;
}

export interface HubSpotSearchResult {
  contacts: HubSpotContact[];
  total: number;
  hasMore: boolean;
}

// ─── Mapper ────────────────────────────────────────────────────────────────────

function mapContact(raw: Record<string, any>): HubSpotContact {
  const props = raw.properties ?? {};
  const firstName = props.firstname ?? '';
  const lastName = props.lastname ?? '';

  return {
    id: raw.id,
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(' ') || 'Unknown',
    email: props.email ?? null,
    phone: props.phone ?? props.mobilephone ?? null,
    // HubSpot stores address across multiple fields
    address: props.address ?? null,
    city: props.city ?? null,
    postcode: props.zip ?? props.postal_code ?? null,
    company: props.company ?? null,
    raw: props,
  };
}

// ─── Search contacts ───────────────────────────────────────────────────────────

/**
 * Full-text search across name, email, phone and company.
 * Returns up to 20 results.
 */
export async function searchContacts(query: string, limit = 20): Promise<HubSpotSearchResult> {
  const body = {
    query,
    limit,
    properties: [
      'firstname', 'lastname', 'email', 'phone', 'mobilephone',
      'address', 'city', 'zip', 'postal_code', 'company',
    ],
    sorts: [{ propertyName: 'lastname', direction: 'ASCENDING' }],
  };

  const res = await fetch(`${BASE_URL}/crm/v3/objects/contacts/search`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HubSpot search failed (${res.status}): ${err}`);
  }

  const data = await res.json();

  return {
    contacts: (data.results ?? []).map(mapContact),
    total: data.total ?? 0,
    hasMore: (data.paging?.next?.after) != null,
  };
}

// ─── Get single contact ────────────────────────────────────────────────────────

export async function getContact(contactId: string): Promise<HubSpotContact> {
  const params = new URLSearchParams({
    properties: [
      'firstname', 'lastname', 'email', 'phone', 'mobilephone',
      'address', 'city', 'zip', 'postal_code', 'company',
    ].join(','),
  });

  const res = await fetch(`${BASE_URL}/crm/v3/objects/contacts/${contactId}?${params}`, {
    method: 'GET',
    headers: headers(),
  });

  if (res.status === 404) throw new Error(`HubSpot contact ${contactId} not found`);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HubSpot getContact failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return mapContact(data);
}

// ─── Map HubSpot contact → RISO HUB project fields ────────────────────────────

/**
 * Returns the subset of fields that can be pre-filled on project creation.
 * The frontend merges these into the new project form.
 */
export function mapContactToProjectFields(contact: HubSpotContact): {
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  address: string | null;
  postcode: string | null;
  hubspotContactId: string;
} {
  // Build the best address string we can from available HubSpot fields
  const addressParts = [contact.address, contact.city].filter(Boolean);
  const address = addressParts.length > 0 ? addressParts.join(', ') : null;

  return {
    customerName: contact.fullName,
    customerEmail: contact.email,
    customerPhone: contact.phone,
    address,
    postcode: contact.postcode,
    hubspotContactId: contact.id,
  };
}

// ─── Verify token is valid (used by health check) ─────────────────────────────

export async function verifyHubSpotConnection(): Promise<{ connected: boolean; portalId?: number; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/integrations/v1/me`, {
      headers: headers(),
    });

    if (!res.ok) {
      return { connected: false, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { connected: true, portalId: data.portalId };
  } catch (err: any) {
    return { connected: false, error: err.message };
  }
}
