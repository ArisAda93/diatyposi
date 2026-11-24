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

/**
 * WhatsApp chat link with optional prefilled text. The app's own scheme opens a chat with the
 * number straight in the WhatsApp app (phone or desktop), with no wa.me page in between.
 */
export const whatsappHref = (phone: string, text?: string): string =>
  `whatsapp://send?phone=${intlDigits(phone)}${text ? `&text=${encodeURIComponent(text)}` : ''}`;

/**
 * WhatsApp Click to Chat link (`https://wa.me/<digits>?text=…`), WhatsApp's documented way to open
 * a chat with a message already typed. Used for the quote message: some WhatsApp apps (the
 * desktop ones in particular) open the chat from the `whatsapp://` scheme but drop its text,
 * while wa.me carries it on phones, desktop and WhatsApp Web. It is an https link, so the caller
 * opens it in a new tab and the page stays where it is.
 */
export const whatsappMessageHref = (phone: string, text?: string): string =>
  `https://wa.me/${intlDigits(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

/**
 * Viber chat link: opens a chat with the number in the Viber app. `draft` prefills the message
 * box. The number carries an encoded + (`%2B`), the form Viber's chat links use on every
 * platform. `draft` is not an officially documented parameter and some Viber apps ignore it, so
 * the quote form also copies the message to the clipboard when it opens Viber.
 */
export const viberHref = (phone: string, draft?: string): string =>
  `viber://chat?number=${encodeURIComponent(`+${intlDigits(phone)}`)}${
    draft ? `&draft=${encodeURIComponent(draft)}` : ''
  }`;
