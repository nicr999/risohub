// Shim: signatureService calls sendSMS({to, body}) as a single object arg.
// The canonical smsService.ts takes positional args sendSMS(to, body).
import { sendSMS as _sendSMS } from '../services/smsService';
export * from '../services/smsService';

export async function sendSMS(toOrParams: string | { to: string; body: string }, body?: string): Promise<void> {
  if (typeof toOrParams === 'object') {
    return _sendSMS(toOrParams.to, toOrParams.body);
  }
  return _sendSMS(toOrParams, body!);
}
