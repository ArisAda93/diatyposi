/**
 * Quote form behaviour (contact page). Validates in the browser with Greek messages, pre-selects
 * services from ?ypiresia=, then posts the request to FormSubmit's AJAX endpoint, which emails it
 * to the shop (the root's `data-email`). While it is on its way the submit button reads
 * “Αποστολή…” (aria-busy) and a second submit is ignored. Then the form gives way to a result
 * panel, focused on its heading: “sent” (with a way to start a new request), or “not sent” after
 * a network error, a 45 s timeout, a non-2xx reply or a reply that is not success "true" (with a
 * retry and the send-it-yourself fallback: email, Viber and WhatsApp links carrying the composed
 * text, and the text to copy). A filled honeypot gets the “sent” panel and sends nothing.
 *
 * Markup contract (src/components/contact/QuoteForm.astro, Field.astro, SendPanel.astro):
 * - root `[data-quote]` with `data-email`, `data-viber`, `data-whatsapp`
 * - `form[data-quote-form]`; each field wrapped in `[data-field="<QuoteField>"]` holding the
 *   control (`[data-describe]` receives aria-describedby) and, for fields that can be wrong,
 *   `[data-field-error]` with `[data-error-text]` inside (the optional services have none)
 * - `[data-error-summary]` (role="alert", tabindex="-1") with `ul[data-error-list]`
 * - `input[data-honeypot]`; `button[data-submit]` with `[data-submit-label]`
 * - `[data-submit-status]` (role="status", outside the form and the panels)
 * - `[data-result="success"]` with `[data-result-heading]`, `a[data-files="email|viber|whatsapp"]`
 *   and `button[data-again]`
 * - `[data-result="failure"]` with `[data-result-heading]`, `button[data-retry]` (with
 *   `[data-submit-label]`), `a[data-send="email|viber|whatsapp"]`, `textarea[data-preview]`,
 *   `button[data-copy]`, `[data-copy-status]` and `button[data-edit]`
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
  buildFilesLinks,
  buildQuoteMessage,
  buildSendLinks,
  buildSubmission,
  chatText,
  firstInvalidField,
  formSubmitEndpoint,
  isoDate,
  isSubmitSuccess,
  nextQuoteField,
  parsePreselect,
  QUOTE_FIELDS,
  SUBMIT_TIMEOUT_MS,
  validateQuote,
  type FormSubmitPayload,
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
  /** The error slot; null for a field that is never wrong (the optional services). */
  error: HTMLElement | null;
  errorText: HTMLElement | null;
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

/**
 * Posts the request to FormSubmit. True only when FormSubmit confirms it (isSubmitSuccess); a
 * network error, the timeout (the abort also cancels reading the reply) or a reply that is not
 * JSON all count as not sent, and the caller shows the failure panel with the fallback.
 */
const deliver = async (endpoint: string, payload: FormSubmitPayload): Promise<boolean> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const json: unknown = await response.json().catch(() => null);
    return isSubmitSuccess(response.ok, json);
  } catch {
    // Offline, blocked, DNS or the timeout's abort: not sent.
    return false;
  } finally {
    window.clearTimeout(timer);
  }
};

const initQuote = (root: HTMLElement): void => {
  const form = root.querySelector<HTMLFormElement>('[data-quote-form]');
  const summary = root.querySelector<HTMLElement>('[data-error-summary]');
  const summaryList = root.querySelector<HTMLUListElement>('[data-error-list]');
  const honeypot = root.querySelector<HTMLInputElement>('[data-honeypot]');
  const submitButton = root.querySelector<HTMLButtonElement>('[data-submit]');
  const submitStatus = root.querySelector<HTMLElement>('[data-submit-status]');
  const success = root.querySelector<HTMLElement>('[data-result="success"]');
  const failure = root.querySelector<HTMLElement>('[data-result="failure"]');
  const successHeading = success?.querySelector<HTMLElement>('[data-result-heading]');
  const failureHeading = failure?.querySelector<HTMLElement>('[data-result-heading]');
  const filesEmail = success?.querySelector<HTMLAnchorElement>('[data-files="email"]');
  const filesViber = success?.querySelector<HTMLAnchorElement>('[data-files="viber"]');
  const filesWhatsapp = success?.querySelector<HTMLAnchorElement>('[data-files="whatsapp"]');
  const againButton = success?.querySelector<HTMLButtonElement>('[data-again]');
  const retryButton = failure?.querySelector<HTMLButtonElement>('[data-retry]');
  const emailLink = failure?.querySelector<HTMLAnchorElement>('[data-send="email"]');
  const viberLink = failure?.querySelector<HTMLAnchorElement>('[data-send="viber"]');
  const whatsappLink = failure?.querySelector<HTMLAnchorElement>('[data-send="whatsapp"]');
  const preview = failure?.querySelector<HTMLTextAreaElement>('[data-preview]');
  const copyButton = failure?.querySelector<HTMLButtonElement>('[data-copy]');
  const copyStatus = failure?.querySelector<HTMLElement>('[data-copy-status]');
  const editButton = failure?.querySelector<HTMLButtonElement>('[data-edit]');
  const { email, viber, whatsapp } = root.dataset;

  if (
    !form ||
    !summary ||
    !summaryList ||
    !honeypot ||
    !submitButton ||
    !submitStatus ||
    !success ||
    !failure ||
    !successHeading ||
    !failureHeading ||
    !filesEmail ||
    !filesViber ||
    !filesWhatsapp ||
    !againButton ||
    !retryButton ||
    !emailLink ||
    !viberLink ||
    !whatsappLink ||
    !preview ||
    !copyButton ||
    !copyStatus ||
    !editButton ||
    !email ||
    !viber ||
    !whatsapp
  ) {
    return;
  }
  const contact = { email, viber, whatsapp };
  const endpoint = formSubmitEndpoint(email);

  const control = (name: string): HTMLInputElement | HTMLTextAreaElement | null => {
    const el = form.elements.namedItem(name);
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : null;
  };
  const value = (name: string): string => control(name)?.value ?? '';
  const checkboxes = Array.from(
    form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="services"]'),
  );
  /** Service slug → full title, for the email and the fallback message. */
  const serviceTitles: Record<string, string> = Object.fromEntries(
    checkboxes.map((box): [string, string] => [box.value, box.dataset.title ?? box.value]),
  );

  const refs = new Map<QuoteField, FieldRefs>();
  for (const field of QUOTE_FIELDS) {
    const wrap = form.querySelector<HTMLElement>(`[data-field="${field}"]`);
    const describe = wrap?.querySelector<HTMLElement>('[data-describe]');
    const error = wrap?.querySelector<HTMLElement>('[data-field-error]') ?? null;
    const errorText = error?.querySelector<HTMLElement>('[data-error-text]') ?? null;
    const focus = wrap?.querySelector<HTMLElement>('input, textarea');
    if (wrap && describe && focus) {
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
    const error = ref?.error;
    const errorText = ref?.errorText;
    if (!ref || !error || !errorText) return;
    const describedBy = (ref.describe.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter((id) => id && id !== error.id);
    if (message) {
      errorText.textContent = message;
      error.hidden = false;
      ref.wrap.dataset.invalid = '';
      delete ref.wrap.dataset.valid;
      describedBy.unshift(error.id);
      if (takesAriaInvalid(ref.describe)) ref.describe.setAttribute('aria-invalid', 'true');
    } else {
      errorText.textContent = '';
      error.hidden = true;
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

  /** The send buttons (submit, and retry on the failure panel) with their resting labels. */
  const sendButtons = [submitButton, retryButton].flatMap((button) => {
    const label = button.querySelector<HTMLElement>('[data-submit-label]');
    return label ? [{ button, label, idle: label.textContent ?? '' }] : [];
  });

  /**
   * Sending state. aria-disabled (not disabled) keeps focus on the pressed button, so a screen
   * reader stays put and hears the new label; the `sending` flag is what blocks a second submit.
   */
  let sending = false;
  let statusTimer = 0;
  const setSending = (on: boolean): void => {
    sending = on;
    for (const { button, label, idle } of sendButtons) {
      if (on) {
        button.setAttribute('aria-busy', 'true');
        button.setAttribute('aria-disabled', 'true');
        label.textContent = text.form.sending;
      } else {
        button.removeAttribute('aria-busy');
        button.removeAttribute('aria-disabled');
        label.textContent = idle;
      }
    }
    // Like announce(), but a quick reply must not leave the “sending” line behind.
    window.clearTimeout(statusTimer);
    submitStatus.textContent = '';
    if (on) {
      statusTimer = window.setTimeout(() => {
        submitStatus.textContent = text.form.sendingStatus;
      }, 60);
    }
  };

  /** Hides the form and both panels, then shows one of them. */
  const show = (view: HTMLElement): void => {
    for (const el of [form, success, failure]) el.hidden = el !== view;
  };

  const showSuccess = (data: QuoteData): void => {
    const links = buildFilesLinks(contact, data.name);
    filesEmail.href = links.email;
    filesViber.href = links.viber;
    filesWhatsapp.href = links.whatsapp;
    show(success);
    successHeading.focus();
  };

  const showFailure = (data: QuoteData): void => {
    const message = buildQuoteMessage(data, serviceTitles);
    const links = buildSendLinks(contact, message);
    emailLink.href = links.email;
    viberLink.href = links.viber;
    whatsappLink.href = links.whatsapp;
    preview.value = chatText(message);
    copyStatus.textContent = '';
    show(failure);
    failureHeading.focus();
  };

  /** The request last sent, for “Δοκιμάστε ξανά”. */
  let lastData: QuoteData | null = null;

  const send = async (data: QuoteData): Promise<void> => {
    if (sending) return;
    lastData = data;
    setSending(true);
    // A filled honeypot is a bot: it sees “sent”, and nothing leaves the page.
    const attempt = async (): Promise<boolean> =>
      honeypot.value.trim() !== '' || deliver(endpoint, buildSubmission(data, serviceTitles));
    // The sending state ends however the attempt ends.
    const delivered = await attempt().finally(() => setSending(false));
    if (delivered) showSuccess(data);
    else showFailure(data);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (sending) return;
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
    void send(data);
  });

  retryButton.addEventListener('click', () => {
    if (lastData) void send(lastData);
  });

  // Back to the form with everything the visitor wrote still in place.
  editButton.addEventListener('click', () => {
    if (sending) return;
    show(form);
    control('name')?.focus();
  });

  // A new request starts from a clean form: no values, marks, errors or summary.
  againButton.addEventListener('click', () => {
    form.reset();
    flagged.clear();
    for (const field of QUOTE_FIELDS) {
      setFieldError(field, undefined);
      const ref = refs.get(field);
      if (ref) delete ref.wrap.dataset.valid;
    }
    renderSummary({});
    if (dateInput instanceof HTMLInputElement) dateInput.min = today();
    lastData = null;
    show(form);
    control('name')?.focus();
  });

  copyButton.addEventListener('click', () => {
    const selectForManualCopy = (): void => {
      preview.focus();
      preview.select();
      announce(copyStatus, text.result.failure.copyFallback);
    };
    if (typeof navigator.clipboard?.writeText !== 'function') {
      selectForManualCopy();
      return;
    }
    navigator.clipboard
      .writeText(preview.value)
      .then(() => announce(copyStatus, text.result.failure.copied), selectForManualCopy);
  });
};

document.querySelectorAll<HTMLElement>('[data-quote]').forEach(initQuote);
