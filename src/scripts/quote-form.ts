/**
 * Quote form behaviour (contact page). Validates in the browser with Greek messages, pre-selects
 * services from ?ypiresia=, then composes the message and reveals the send panel with email,
 * Viber and WhatsApp links. Nothing is sent over the network.
 *
 * Markup contract (src/components/contact/QuoteForm.astro, Field.astro, SendPanel.astro):
 * - root `[data-quote]` with `data-email`, `data-viber`, `data-whatsapp`
 * - `form[data-quote-form]`; each field wrapped in `[data-field="<QuoteField>"]` holding the
 *   control (`[data-describe]` receives aria-describedby) and `[data-field-error]` with
 *   `[data-error-text]` inside
 * - `[data-error-summary]` (role="alert", tabindex="-1") with `ul[data-error-list]`
 * - `[data-send-panel]` with `[data-send-heading]`, `a[data-send="email|viber|whatsapp"]`,
 *   `textarea[data-preview]`, `button[data-copy]`, `[data-copy-status]`, `button[data-edit]`
 */
import {
  buildQuoteMessage,
  buildSendLinks,
  chatText,
  isoDate,
  parsePreselect,
  validateQuote,
  type QuoteData,
  type QuoteErrors,
  type QuoteField,
} from '~/lib/quote';
import { contactText } from '~/i18n/pages/contact';

const text = contactText.el;

const FIELDS: readonly QuoteField[] = [
  'name',
  'phone',
  'email',
  'services',
  'quantity',
  'date',
  'message',
];

interface FieldRefs {
  wrap: HTMLElement;
  /** Element that carries aria-describedby (the input, or the services fieldset). */
  describe: HTMLElement;
  error: HTMLElement;
  errorText: HTMLElement;
  /** First focusable control of the field. */
  focus: HTMLElement;
}

const isQuoteField = (value: string | undefined): value is QuoteField =>
  FIELDS.some((field) => field === value);

/** Text inputs get aria-invalid; the fieldset does not (it is not a valid target for it). */
const takesAriaInvalid = (el: HTMLElement): boolean =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

const announce = (region: HTMLElement, message: string): void => {
  // Clear first so the same message is announced again on a repeated action.
  region.textContent = '';
  window.setTimeout(() => {
    region.textContent = message;
  }, 60);
};

const initQuote = (root: HTMLElement): void => {
  const form = root.querySelector<HTMLFormElement>('[data-quote-form]');
  const summary = root.querySelector<HTMLElement>('[data-error-summary]');
  const summaryList = root.querySelector<HTMLUListElement>('[data-error-list]');
  const panel = root.querySelector<HTMLElement>('[data-send-panel]');
  const panelHeading = root.querySelector<HTMLElement>('[data-send-heading]');
  const preview = root.querySelector<HTMLTextAreaElement>('[data-preview]');
  const copyButton = root.querySelector<HTMLButtonElement>('[data-copy]');
  const copyStatus = root.querySelector<HTMLElement>('[data-copy-status]');
  const editButton = root.querySelector<HTMLButtonElement>('[data-edit]');
  const emailLink = root.querySelector<HTMLAnchorElement>('[data-send="email"]');
  const viberLink = root.querySelector<HTMLAnchorElement>('[data-send="viber"]');
  const whatsappLink = root.querySelector<HTMLAnchorElement>('[data-send="whatsapp"]');
  const { email, viber, whatsapp } = root.dataset;

  if (
    !form ||
    !summary ||
    !summaryList ||
    !panel ||
    !panelHeading ||
    !preview ||
    !copyButton ||
    !copyStatus ||
    !editButton ||
    !emailLink ||
    !viberLink ||
    !whatsappLink ||
    !email ||
    !viber ||
    !whatsapp
  ) {
    return;
  }
  const contact = { email, viber, whatsapp };

  const control = (name: string): HTMLInputElement | HTMLTextAreaElement | null => {
    const el = form.elements.namedItem(name);
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : null;
  };
  const value = (name: string): string => control(name)?.value ?? '';
  const checkboxes = Array.from(
    form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="services"]'),
  );

  const refs = new Map<QuoteField, FieldRefs>();
  for (const field of FIELDS) {
    const wrap = form.querySelector<HTMLElement>(`[data-field="${field}"]`);
    const describe = wrap?.querySelector<HTMLElement>('[data-describe]');
    const error = wrap?.querySelector<HTMLElement>('[data-field-error]');
    const errorText = error?.querySelector<HTMLElement>('[data-error-text]');
    const focus = wrap?.querySelector<HTMLElement>('input, textarea');
    if (wrap && describe && error && errorText && focus) {
      refs.set(field, { wrap, describe, error, errorText, focus });
    }
  }

  const today = (): string => isoDate(new Date());

  const dateInput = control('date');
  if (dateInput instanceof HTMLInputElement) dateInput.min = today();

  // Pre-select services passed in the URL (e.g. from “Ζητήστε προσφορά για αυτό”).
  const preselected = parsePreselect(
    window.location.search,
    checkboxes.map((box) => box.value),
  );
  for (const box of checkboxes) {
    if (preselected.includes(box.value)) box.checked = true;
  }

  const readData = (): QuoteData => ({
    name: value('name'),
    phone: value('phone'),
    email: value('email'),
    services: checkboxes.filter((box) => box.checked).map((box) => box.value),
    quantity: value('quantity'),
    date: value('date'),
    message: value('message'),
  });

  /**
   * validateQuote plus the one check it cannot see: a half-typed date. With novalidate the date
   * input then reports value === '' and validity.badInput === true, so it would pass as empty.
   */
  const collectErrors = (data: QuoteData): QuoteErrors => {
    const errors = validateQuote(data, today());
    if (dateInput instanceof HTMLInputElement && dateInput.validity.badInput) {
      errors.date = text.errors.dateInvalid;
    }
    return errors;
  };

  const setFieldError = (field: QuoteField, message: string | undefined): void => {
    const ref = refs.get(field);
    if (!ref) return;
    const describedBy = (ref.describe.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter((id) => id && id !== ref.error.id);
    if (message) {
      ref.errorText.textContent = message;
      ref.error.hidden = false;
      ref.wrap.dataset.invalid = '';
      describedBy.unshift(ref.error.id);
      if (takesAriaInvalid(ref.describe)) ref.describe.setAttribute('aria-invalid', 'true');
    } else {
      ref.errorText.textContent = '';
      ref.error.hidden = true;
      delete ref.wrap.dataset.invalid;
      if (takesAriaInvalid(ref.describe)) ref.describe.removeAttribute('aria-invalid');
    }
    if (describedBy.length > 0) {
      ref.describe.setAttribute('aria-describedby', describedBy.join(' '));
    } else {
      ref.describe.removeAttribute('aria-describedby');
    }
  };

  const renderSummary = (errors: QuoteErrors): void => {
    const items: HTMLLIElement[] = [];
    for (const field of FIELDS) {
      const message = errors[field];
      const ref = refs.get(field);
      if (!message || !ref) continue;
      const item = document.createElement('li');
      item.dataset.summaryField = field;
      const link = document.createElement('a');
      link.href = `#${ref.focus.id}`;
      link.textContent = message;
      item.append(link);
      items.push(item);
    }
    summaryList.replaceChildren(...items);
    summary.hidden = items.length === 0;
  };

  /** Live update: drop fixed items, refresh changed messages, never add new ones. */
  const refreshSummary = (errors: QuoteErrors): void => {
    for (const item of Array.from(summaryList.children)) {
      if (!(item instanceof HTMLElement)) continue;
      const field = item.dataset.summaryField;
      if (!isQuoteField(field)) continue;
      const message = errors[field];
      const link = item.querySelector('a');
      if (!message) item.remove();
      else if (link && link.textContent !== message) link.textContent = message;
    }
    if (summaryList.childElementCount === 0) summary.hidden = true;
  };

  summaryList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a');
    const field = link?.closest('li')?.dataset.summaryField;
    if (!link || !isQuoteField(field)) return;
    const ref = refs.get(field);
    if (!ref) return;
    event.preventDefault();
    ref.wrap.scrollIntoView({ block: 'start' });
    ref.focus.focus({ preventScroll: true });
  });

  // Fields flagged on a submit are re-checked as the visitor types or changes them.
  const flagged = new Set<QuoteField>();
  const revalidate = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const field = target.closest<HTMLElement>('[data-field]')?.dataset.field;
    if (!isQuoteField(field) || !flagged.has(field)) return;
    const errors = collectErrors(readData());
    setFieldError(field, errors[field]);
    refreshSummary(errors);
  };
  form.addEventListener('input', revalidate);
  form.addEventListener('change', revalidate);

  const showPanel = (data: QuoteData): void => {
    const titles: Record<string, string> = Object.fromEntries(
      checkboxes.map((box): [string, string] => [box.value, box.dataset.title ?? box.value]),
    );
    const message = buildQuoteMessage(data, titles);
    const links = buildSendLinks(contact, message);
    emailLink.href = links.email;
    viberLink.href = links.viber;
    whatsappLink.href = links.whatsapp;
    preview.value = chatText(message);
    copyStatus.textContent = '';
    form.hidden = true;
    panel.hidden = false;
    panelHeading.focus();
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = readData();
    const errors = collectErrors(data);
    for (const field of FIELDS) {
      const message = errors[field];
      setFieldError(field, message);
      if (message) flagged.add(field);
    }
    renderSummary(errors);
    if (!summary.hidden) {
      summary.focus();
      return;
    }
    showPanel(data);
  });

  editButton.addEventListener('click', () => {
    panel.hidden = true;
    form.hidden = false;
    control('name')?.focus();
  });

  copyButton.addEventListener('click', () => {
    const selectForManualCopy = (): void => {
      preview.focus();
      preview.select();
      announce(copyStatus, text.send.copyFallback);
    };
    if (typeof navigator.clipboard?.writeText !== 'function') {
      selectForManualCopy();
      return;
    }
    navigator.clipboard
      .writeText(preview.value)
      .then(() => announce(copyStatus, text.send.copied), selectForManualCopy);
  });
};

document.querySelectorAll<HTMLElement>('[data-quote]').forEach(initQuote);
