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
 *
 * State hooks for the CSS: `data-invalid` on a field wrapper while it shows an error (set only
 * after a submit), `data-valid` once a filled-in field passes the same checks (set when the
 * visitor leaves the field or, for a flagged field, as they type; removed as soon as it no longer
 * passes, so the mark never claims more than the validation does).
 *
 * A submit with errors fills the summary and takes the visitor to the first field that needs
 * fixing (scrolled to its label, clear of the fixed header and the phone call bar through the
 * page's scroll padding, then focused). On touch screens the keyboard's “next” key
 * (`enterkeyhint="next"`) moves on to the next field instead of submitting the form.
 */
import {
  buildQuoteMessage,
  buildSendLinks,
  chatText,
  firstInvalidField,
  isoDate,
  nextQuoteField,
  parsePreselect,
  QUOTE_FIELDS,
  validateQuote,
  type QuoteData,
  type QuoteErrors,
  type QuoteField,
} from '~/lib/quote';
import { contactText } from '~/i18n/pages/contact';

const text = contactText.el;

/** Devices whose keyboard is usually on screen (the “next” key applies only there). */
const coarsePointer = window.matchMedia('(pointer: coarse)');

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
  QUOTE_FIELDS.some((field) => field === value);

/** Whether the visitor has entered anything in a field (a valid mark needs a value). */
const isFilled = (data: QuoteData, field: QuoteField): boolean => {
  const entry = data[field];
  return Array.isArray(entry) ? entry.length > 0 : entry.trim() !== '';
};

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
  for (const field of QUOTE_FIELDS) {
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
      delete ref.wrap.dataset.valid;
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
    for (const field of QUOTE_FIELDS) {
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

  /**
   * Brings a field's label into view (the page's scroll padding keeps it clear of the fixed
   * header and the call bar) and focuses its control. False when the field is not on the page.
   */
  const revealField = (field: QuoteField): boolean => {
    const ref = refs.get(field);
    if (!ref) return false;
    ref.wrap.scrollIntoView({ block: 'start' });
    ref.focus.focus({ preventScroll: true });
    return true;
  };

  summaryList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a');
    const field = link?.closest('li')?.dataset.summaryField;
    if (!link || !isQuoteField(field)) return;
    if (revealField(field)) event.preventDefault();
  });

  /** Sets or clears the valid mark of one field from the current data and errors. */
  const markValid = (field: QuoteField, data: QuoteData, errors: QuoteErrors): void => {
    const ref = refs.get(field);
    if (!ref) return;
    if (!errors[field] && isFilled(data, field)) ref.wrap.dataset.valid = '';
    else delete ref.wrap.dataset.valid;
  };

  const fieldOf = (target: EventTarget | null): QuoteField | null => {
    if (!(target instanceof HTMLElement)) return null;
    const field = target.closest<HTMLElement>('[data-field]')?.dataset.field;
    return isQuoteField(field) ? field : null;
  };

  // iOS Safari applies :active (the service tiles' press feedback) only under a touch listener.
  form.addEventListener('touchstart', () => undefined, { passive: true });

  // The on-screen keyboard's “next” key sends Enter, which would submit the form from any
  // single-line field: move to the next field instead. Desktop keyboards keep Enter to submit.
  form.addEventListener('keydown', (event) => {
    // keyCode 229: WebKit sends the Enter that confirms an IME composition after compositionend,
    // with isComposing already false; that Enter belongs to the IME, not to the form.
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
    if (!coarsePointer.matches) return;
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.getAttribute('enterkeyhint') !== 'next') {
      return;
    }
    const field = fieldOf(target);
    const next = field ? nextQuoteField(field) : null;
    const nextRef = next ? refs.get(next) : undefined;
    if (!nextRef) return;
    event.preventDefault();
    nextRef.focus.focus();
  });

  // Fields flagged on a submit are re-checked as the visitor types or changes them. A field that
  // carries the valid mark is re-checked too, so the mark goes as soon as the value stops passing.
  const flagged = new Set<QuoteField>();
  const revalidate = (event: Event): void => {
    const field = fieldOf(event.target);
    if (!field) return;
    const isFlagged = flagged.has(field);
    const hasMark = refs.get(field)?.wrap.dataset.valid !== undefined;
    // Ticking a service is a finished choice: confirm it at once, like leaving a text field.
    if (!isFlagged && !hasMark && !(field === 'services' && event.type === 'change')) return;
    const data = readData();
    const errors = collectErrors(data);
    if (isFlagged) {
      setFieldError(field, errors[field]);
      refreshSummary(errors);
    }
    markValid(field, data, errors);
  };
  form.addEventListener('input', revalidate);
  form.addEventListener('change', revalidate);

  // Leaving a field confirms it when it passes; errors still wait for a submit.
  form.addEventListener('focusout', (event) => {
    const field = fieldOf(event.target);
    if (!field) return;
    const data = readData();
    markValid(field, data, collectErrors(data));
  });

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
    for (const field of QUOTE_FIELDS) {
      const message = errors[field];
      setFieldError(field, message);
      if (message) flagged.add(field);
      markValid(field, data, errors);
    }
    renderSummary(errors);
    if (!summary.hidden) {
      // The summary (role="alert") lists every problem; the visitor lands on the first one.
      const first = firstInvalidField(errors);
      if (!first || !revealField(first)) summary.focus();
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
