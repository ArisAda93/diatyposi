/**
 * Quote request logic: validation, service pre-selection from the URL, the FormSubmit request
 * that delivers the quote to the shop's inbox (endpoint, payload, reading the reply) and, for
 * when sending fails, the message the visitor can send with their own email, Viber or WhatsApp
 * app. Nothing here touches the DOM or the network (src/scripts/quote-form.ts does the request),
 * so it is unit-tested in tests/quote.test.ts.
 *
 * Relative imports only: vitest runs without the `~` alias.
 */
import { mailtoHref, viberHref, whatsappHref } from './links';
import { contactText } from '../i18n/pages/contact';

const strings = contactText.el;

export interface QuoteData {
  name: string;
  phone: string;
  /** Optional. */
  email: string;
  /** Optional. Selected service slugs, in display order. */
  services: string[];
  /** Optional free text, e.g. "500 τεμάχια". */
  quantity: string;
  /** Optional ISO date (yyyy-mm-dd), as given by <input type="date">. */
  date: string;
  message: string;
}

export type QuoteField = keyof QuoteData;

/** Field → Greek error message. Empty when the data is valid. */
export type QuoteErrors = Partial<Record<QuoteField, string>>;

/** The fields in form (and reading) order. */
export const QUOTE_FIELDS: readonly QuoteField[] = [
  'name',
  'phone',
  'email',
  'services',
  'quantity',
  'date',
  'message',
];

/** The first field in form order that has an error, or null when there is none. */
export const firstInvalidField = (errors: QuoteErrors): QuoteField | null =>
  QUOTE_FIELDS.find((field) => Boolean(errors[field])) ?? null;

/**
 * Where the on-screen keyboard's “next” key goes from a field: the next field in form order,
 * skipping the date (focusing it opens no keyboard and, on some phones, no picker either).
 * Null after the last field.
 */
export const nextQuoteField = (field: QuoteField): QuoteField | null =>
  QUOTE_FIELDS.slice(QUOTE_FIELDS.indexOf(field) + 1).find((next) => next !== 'date') ?? null;

export interface QuoteMessage {
  subject: string;
  body: string;
}

/** Where the message goes. Values come from `site.contact`. */
export interface QuoteContact {
  email: string;
  viber: string;
  whatsapp: string;
}

export type QuoteLinks = QuoteContact;

/** Query parameter that pre-selects services: ?ypiresia=a,b or ?ypiresia=a&ypiresia=b */
export const PRESELECT_PARAM = 'ypiresia';

export const MESSAGE_MIN_LENGTH = 10;
export const PHONE_MIN_DIGITS = 10;
export const PHONE_MAX_DIGITS = 15;

/** Digits, spaces, dashes and parentheses, with an optional leading +. */
const PHONE_PATTERN = /^\+?[\d\s()-]+$/;
/** Something@domain.tld: no spaces, one @, no empty domain labels. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isValidPhone = (value: string): boolean => {
  const phone = value.trim();
  if (!PHONE_PATTERN.test(phone)) return false;
  const digits = phone.replace(/\D/g, '').length;
  return digits >= PHONE_MIN_DIGITS && digits <= PHONE_MAX_DIGITS;
};

export const isValidEmail = (value: string): boolean => EMAIL_PATTERN.test(value.trim());

/** True for a real calendar date written as yyyy-mm-dd. */
export const isValidIsoDate = (value: string): boolean => {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

/** The local calendar date as yyyy-mm-dd (the value format of <input type="date">). */
export const isoDate = (date: Date): string => {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** yyyy-mm-dd → dd/mm/yyyy, as dates are written in Greece. */
export const formatDateEl = (iso: string): string => {
  const match = ISO_DATE_PATTERN.exec(iso);
  if (!match) return iso;
  const [, year = '', month = '', day = ''] = match;
  return `${day}/${month}/${year}`;
};

/**
 * Validates the form data. `today` is the local date as yyyy-mm-dd (see `isoDate`); a desired
 * date before it is rejected, today itself is accepted.
 */
export const validateQuote = (data: QuoteData, today: string): QuoteErrors => {
  const e = strings.errors;
  const errors: QuoteErrors = {};

  if (!data.name.trim()) errors.name = e.nameRequired;

  const phone = data.phone.trim();
  if (!phone) errors.phone = e.phoneRequired;
  else if (!isValidPhone(phone)) errors.phone = e.phoneInvalid;

  const email = data.email.trim();
  if (email && !isValidEmail(email)) errors.email = e.emailInvalid;

  const date = data.date.trim();
  if (date) {
    if (!isValidIsoDate(date)) errors.date = e.dateInvalid;
    else if (date < today) errors.date = e.datePast;
  }

  const message = data.message.trim();
  if (!message) errors.message = e.messageRequired;
  else if (Array.from(message).length < MESSAGE_MIN_LENGTH) errors.message = e.messageShort;

  return errors;
};

/**
 * Service slugs to pre-select, read from the query string (one or more values, comma-separated
 * or repeated). Unknown slugs and duplicates are dropped; order of first appearance is kept.
 */
export const parsePreselect = (search: string, validSlugs: readonly string[]): string[] => {
  const valid = new Set(validSlugs);
  const picked: string[] = [];
  for (const raw of new URLSearchParams(search).getAll(PRESELECT_PARAM)) {
    for (const part of raw.split(',')) {
      const slug = part.trim();
      if (valid.has(slug) && !picked.includes(slug)) picked.push(slug);
    }
  }
  return picked;
};

/** "Αίτημα προσφοράς – <name>", or just "Αίτημα προσφοράς" without a name. */
export const quoteSubject = (name: string): string => {
  const trimmed = name.trim();
  return trimmed ? `${strings.message.subject} – ${trimmed}` : strings.message.subject;
};

/**
 * Composes the Greek message: subject "Αίτημα προσφοράς – <name>" and a body with one labelled
 * line per filled field, services by full title, the date as dd/mm/yyyy, then the message.
 * Lines are joined with \n; `mailtoHref` converts them to CRLF for the email body.
 */
export const buildQuoteMessage = (
  data: QuoteData,
  serviceTitles: Readonly<Record<string, string>>,
): QuoteMessage => {
  const m = strings.message;
  const lines: string[] = [m.greeting, '', m.intro, ''];
  const addLine = (label: string, value: string): void => {
    const trimmed = value.trim();
    if (trimmed) lines.push(`${label}: ${trimmed}`);
  };

  addLine(m.nameLabel, data.name);
  addLine(m.phoneLabel, data.phone);
  addLine(m.emailLabel, data.email);
  if (data.services.length > 0) {
    lines.push(`${m.servicesLabel}:`);
    for (const slug of data.services) lines.push(`– ${serviceTitles[slug] ?? slug}`);
  }
  addLine(m.quantityLabel, data.quantity);
  const date = data.date.trim();
  if (date) addLine(m.dateLabel, formatDateEl(date));

  const message = data.message.replace(/\r\n?/g, '\n').trim();
  if (message) lines.push('', `${m.messageLabel}:`, message);

  return { subject: quoteSubject(data.name), body: lines.join('\n') };
};

/** The text for chat apps and the preview: subject line, blank line, body. */
export const chatText = (message: QuoteMessage): string => `${message.subject}\n\n${message.body}`;

/** The three send links: email (subject + body), Viber and WhatsApp (chat text). */
export const buildSendLinks = (contact: QuoteContact, message: QuoteMessage): QuoteLinks => {
  const text = chatText(message);
  return {
    email: mailtoHref(contact.email, message.subject, message.body),
    viber: viberHref(contact.viber, text),
    whatsapp: whatsappHref(contact.whatsapp, text),
  };
};

/**
 * Links for sending files after a request went through (the form takes no attachments): an email
 * and chats that open with "Αρχεία για το αίτημα προσφοράς – <name>" as subject or first line.
 */
export const buildFilesLinks = (contact: QuoteContact, name: string): QuoteLinks => {
  const base = strings.result.success.filesSubject;
  const trimmed = name.trim();
  const subject = trimmed ? `${base} – ${trimmed}` : base;
  return {
    email: mailtoHref(contact.email, subject),
    viber: viberHref(contact.viber, subject),
    whatsapp: whatsappHref(contact.whatsapp, subject),
  };
};

/*
 * Delivery through FormSubmit (formsubmit.co): a static-site form service that emails what it
 * receives to the address in the URL. No account and no backend: the first request ever sent to
 * an address makes FormSubmit email an activation link to it, and until the owner clicks that
 * link every request is answered with success "false" (the visitor then sees the failure panel
 * with the send-it-yourself fallback).
 */

/** The FormSubmit AJAX endpoint (JSON in, JSON out). */
export const FORMSUBMIT_AJAX_BASE = 'https://formsubmit.co/ajax/';

/**
 * How long the visitor waits for FormSubmit before the request counts as failed. Generous on
 * purpose: FormSubmit has been seen taking 20 s and more to answer, and giving up early shows
 * “not sent” for a request that may still arrive, so the visitor sends it again (a duplicate).
 */
export const SUBMIT_TIMEOUT_MS = 45_000;

/** Joins the chosen services' full titles (titles themselves contain commas). */
export const SERVICES_SEPARATOR = '; ';

/** The AJAX endpoint that delivers to `email` (the @ stays readable, anything else is encoded). */
export const formSubmitEndpoint = (email: string): string =>
  `${FORMSUBMIT_AJAX_BASE}${encodeURIComponent(email.trim()).replace(/%40/g, '@')}`;

/** FormSubmit's JSON body: field label → value, plus its own `_` settings. */
export type FormSubmitPayload = Record<string, string>;

/**
 * The JSON body FormSubmit emails as a table. Keys are the Greek labels (FormSubmit prints them
 * as the table's labels), in form order, and only for filled fields: services by full title,
 * the date as dd/mm/yyyy, the description with \n line breaks. Then FormSubmit's own settings:
 * the email subject, the table template, no captcha page (it never applies to AJAX anyway) and,
 * when the visitor gave an email, the reply-to address, so the owner can answer with Reply.
 */
export const buildSubmission = (
  data: QuoteData,
  serviceTitles: Readonly<Record<string, string>>,
): FormSubmitPayload => {
  const m = strings.message;
  const payload: FormSubmitPayload = {};
  const add = (label: string, value: string): void => {
    const trimmed = value.trim();
    if (trimmed) payload[label] = trimmed;
  };

  add(m.nameLabel, data.name);
  add(m.phoneLabel, data.phone);
  const email = data.email.trim();
  add(m.emailLabel, email);
  add(
    m.servicesLabel,
    data.services.map((slug) => serviceTitles[slug] ?? slug).join(SERVICES_SEPARATOR),
  );
  add(m.quantityLabel, data.quantity);
  const date = data.date.trim();
  if (date) add(m.dateLabel, formatDateEl(date));
  add(m.messageLabel, data.message.replace(/\r\n?/g, '\n'));

  payload['_subject'] = quoteSubject(data.name);
  payload['_template'] = 'table';
  payload['_captcha'] = 'false';
  if (email) payload['_replyto'] = email;
  return payload;
};

/**
 * Whether FormSubmit accepted the request: a 2xx reply whose JSON says success true (FormSubmit
 * sends the string "true"). Anything else is a failure, including success "false" (for example
 * the one-time "This form needs Activation" reply) and a body that is not JSON (`json` null).
 */
export const isSubmitSuccess = (ok: boolean, json: unknown): boolean => {
  if (!ok || typeof json !== 'object' || json === null || !('success' in json)) return false;
  const { success } = json;
  return success === true || success === 'true';
};
