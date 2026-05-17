// ============================================================
// RISO HUB — emailService addition: sendPortalInvite
// Paste this into emailService.ts alongside the other exports.
// ============================================================

export interface PortalInviteParams {
  to:           string;
  customerName: string;
  address:      string;
  portalUrl:    string;
  expiryDays:   number;
}

export async function sendPortalInvite(p: PortalInviteParams): Promise<SendResult> {
  const html = layout(`
    <h1>Your installation documents are ready</h1>
    <p>Hi ${p.customerName},</p>
    <p>Your heat pump installation handover pack is now available to view online.
    This includes your signed documents, MCS registration details, and system information.</p>
    <a href="${p.portalUrl}" class="btn">View your installation documents →</a>
    <div class="info-box">
      <div class="info-row">
        <span class="info-key">Address</span>
        <span class="info-val">${p.address}</span>
      </div>
      <div class="info-row">
        <span class="info-key">Link expires</span>
        <span class="info-val">In ${p.expiryDays} days</span>
      </div>
    </div>
    <p style="font-size:13px;color:#aaa;">
      Your documents can also be accessed at any time by contacting our team.<br />
      This link is personal to you — please do not share it.
    </p>
    <p style="font-size:13px;color:#aaa;word-break:break-all;">${p.portalUrl}</p>
  `, `Your heat pump installation handover pack is ready to view`);

  const text = `Hi ${p.customerName},\n\nYour installation handover pack is ready to view.\n\nAddress: ${p.address}\nLink expires in: ${p.expiryDays} days\n\nView your documents here:\n${p.portalUrl}\n\nThis link is personal to you. Do not share it.\n\nRISO HOME`;

  return sendRaw({
    to:      p.to,
    subject: `Your installation documents are ready — ${p.customerName}`,
    html,
    text,
  });
}
