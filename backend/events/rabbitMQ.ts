// Shim: signatureService imports publishEvent with 3 args (exchange, routingKey, payload).
// The canonical eventBus.ts takes 2 args (routingKey, payload) — exchange is ignored here.
import { publishEvent as _publishEvent } from '../services/eventBus';

export async function publishEvent(
  _exchange: string,
  routingKey: string,
  payload: object
): Promise<void> {
  return _publishEvent(routingKey, payload);
}
