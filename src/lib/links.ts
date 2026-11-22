/**
 * Builders for contact deep links. Pure functions, unit-tested in tests/links.test.ts.
 */

/** Keep digits and a leading +. */
export const normalizePhone = (phone: string): string => {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
};

/** International digits without + (e.g. "306900000000"), as WhatsApp and Viber expect. */
export const intlDigits = (phone: string): string => normalizePhone(phone).replace(/^\+/, '');

export const telHref = (phone: string): string => `tel:${normalizePhone(phone)}`;

/** Normalise line breaks to CRLF, as RFC 6068 asks for mailto bodies. */
const crlf = (text: string): string => text.replace(/\r?\n/g, '\r\n');

export const mailtoHref = (email: string, subject?: string, body?: string): string => {
  const params: string[] = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(crlf(body))}`);
  return `mailto:${email}${params.length ? `?${params.join('&')}` : ''}`;
};

/** WhatsApp click-to-chat link with optional prefilled text. */
export const whatsappHref = (phone: string, text?: string): string =>
  `https://wa.me/${intlDigits(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

/**
 * Viber chat link. `draft` prefills the message box (supported by the Viber apps on mobile and
 * desktop). The number must carry an encoded +.
 */
export const viberHref = (phone: string, draft?: string): string =>
  `viber://chat?number=${encodeURIComponent(`+${intlDigits(phone)}`)}${
    draft ? `&draft=${encodeURIComponent(draft)}` : ''
  }`;
