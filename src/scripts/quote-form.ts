/**
 * Quote form behaviour (contact page). Validates in the browser with Greek messages and
 * pre-selects services from ?ypiresia=. The site sends nothing itself: the form has three submit
 * buttons, one per app (email, Viber, WhatsApp), and a valid submit composes the request
 * (buildQuoteMessage), gives way to the “ready” panel, focused on its heading, and opens the app
 * of the pressed button with the message prefilled and addressed to the shop (the root's
 * `data-email`, `data-viber`, `data-whatsapp`). Enter in a field submits with the first button,
 * so a submit without a known button value opens email. The panel keeps the three links (to open
 * the same or another app again), the text to copy, a way back to the form with everything kept,
 * and a way to start a new request from a clean form. Opening Viber or WhatsApp also copies the
 * message to the clipboard and says so (`[data-chat-hint]`), because some of their apps open the
 * chat without the prefilled text; WhatsApp's link is wa.me and opens in a new tab.
 *
 * Markup contract (src/components/contact/QuoteForm.astro, Field.astro, SendPanel.astro):
 * - root `[data-quote]` with `data-email`, `data-viber`, `data-whatsapp`
 * - `form[data-quote-form]` (novalidate); each field wrapped in `[data-field="<QuoteField>"]`
 *   holding the control (`[data-describe]` receives aria-describedby) and, for fields that can be
 *   wrong, `[data-field-error]` with `[data-error-text]` inside (the optional services have none)
 * - `[data-error-summary]` (role="alert", tabindex="-1") with `ul[data-error-list]`
 * - three submit buttons in the form, in this order: `button[type="submit"][name="via"]` with
 *   `value` and `data-via` set to "email", "viber" and "whatsapp"
 * - `[data-result="ready"]` (hidden, a sibling of the form inside the root) with
 *   `[data-result-heading]` (tabindex="-1"), `[data-chat-hint]` (role="status"),
 *   `a[data-send="email|viber|whatsapp"]` (WhatsApp with target="_blank"),
 *   `textarea[data-preview]`, `button[data-copy]`, `[data-copy-status]`, `button[data-edit]` and
 *   `button[data-again]`
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
  sendChannel,
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

const initQuote = (root: HTMLElement): void => {
  const form = root.querySelector<HTMLFormElement>('[data-quote-form]');
  const summary = root.querySelector<HTMLElement>('[data-error-summary]');
  const summaryList = root.querySelector<HTMLUListElement>('[data-error-list]');
  const ready = root.querySelector<HTMLElement>('[data-result="ready"]');
  const readyHeading = ready?.querySelector<HTMLElement>('[data-result-heading]');
  const emailLink = ready?.querySelector<HTMLAnchorElement>('a[data-send="email"]');
  const viberLink = ready?.querySelector<HTMLAnchorElement>('a[data-send="viber"]');
  const whatsappLink = ready?.querySelector<HTMLAnchorElement>('a[data-send="whatsapp"]');
  const preview = ready?.querySelector<HTMLTextAreaElement>('[data-preview]');
  const copyButton = ready?.querySelector<HTMLButtonElement>('[data-copy]');
  const copyStatus = ready?.querySelector<HTMLElement>('[data-copy-status]');
  const chatHint = ready?.querySelector<HTMLElement>('[data-chat-hint]');
  const editButton = ready?.querySelector<HTMLButtonElement>('[data-edit]');
  const againButton = ready?.querySelector<HTMLButtonElement>('[data-again]');
  const { email, viber, whatsapp } = root.dataset;

  if (
    !form ||
    !summary ||
    !summaryList ||
    !ready ||
    !readyHeading ||
    !emailLink ||
    !viberLink ||
    !whatsappLink ||
    !preview ||
    !copyButton ||
    !copyStatus ||
    !chatHint ||
    !editButton ||
    !againButton ||
    !email ||
    !viber ||
    !whatsapp
  ) {
    return;
  }
  const contact = { email, viber, whatsapp };
  /** The panel's send links by app: the visible links and the ones a submit opens. */
  const sendLinks = { email: emailLink, viber: viberLink, whatsapp: whatsappLink };

  const control = (name: string): HTMLInputElement | HTMLTextAreaElement | null => {
    const el = form.elements.namedItem(name);
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : null;
  };
  const value = (name: string): string => control(name)?.value ?? '';
  const checkboxes = Array.from(
    form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="services"]'),
  );
  /** Service slug → full title, for the composed message. */
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
   * `behavior` 'auto' follows the page's smooth scrolling; 'instant' is for a view swap.
   */
  const revealField = (field: QuoteField, behavior: ScrollBehavior = 'auto'): boolean => {
    const ref = refs.get(field);
    if (!ref) return false;
    ref.wrap.scrollIntoView({ block: 'start', behavior });
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

  /**
   * Shows the form or the ready panel, and hides the other. After a swap the view is scrolled
   * into place instantly: the page's smooth scrolling gets cancelled by the layout change when the
   * form and the panel swap, which leaves the focused element out of sight.
   */
  const show = (view: HTMLElement): void => {
    for (const el of [form, ready]) el.hidden = el !== view;
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
    // The pressed button names the app; Enter in a field submits with the first one (email).
    const channel = sendChannel(
      event.submitter instanceof HTMLButtonElement ? event.submitter.value : null,
    );
    const message = buildQuoteMessage(data, serviceTitles);
    const links = buildSendLinks(contact, message);
    emailLink.href = links.email;
    viberLink.href = links.viber;
    whatsappLink.href = links.whatsapp;
    preview.value = chatText(message);
    copyStatus.textContent = '';
    chatHint.textContent = '';
    show(ready);
    ready.scrollIntoView({ block: 'start', behavior: 'instant' });
    readyHeading.focus({ preventScroll: true });
    // Open the chosen app through the panel's own link, the same one the visitor can press again;
    // the submit's user activation lets the app link open from here.
    sendLinks[channel].click();
  });

  // Back to the form with everything the visitor wrote still in place.
  editButton.addEventListener('click', () => {
    show(form);
    revealField('name', 'instant');
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
    show(form);
    revealField('name', 'instant');
  });

  // Viber and WhatsApp: some of their apps open the chat without the prefilled text, so opening
  // either one (from a submit, which clicks this same link, or from the panel) also copies the
  // message and says so; the visitor can then paste it. The click carries the user activation the
  // clipboard needs. Nothing is said if copying is not allowed: the copy button stays available.
  for (const link of [viberLink, whatsappLink]) {
    link.addEventListener('click', () => {
      if (typeof navigator.clipboard?.writeText !== 'function') return;
      navigator.clipboard.writeText(preview.value).then(
        () => announce(chatHint, text.result.ready.chatCopied),
        () => undefined,
      );
    });
  }

  copyButton.addEventListener('click', () => {
    const selectForManualCopy = (): void => {
      preview.focus();
      preview.select();
      announce(copyStatus, text.result.ready.copyFallback);
    };
    if (typeof navigator.clipboard?.writeText !== 'function') {
      selectForManualCopy();
      return;
    }
    navigator.clipboard
      .writeText(preview.value)
      .then(() => announce(copyStatus, text.result.ready.copied), selectForManualCopy);
  });
};

document.querySelectorAll<HTMLElement>('[data-quote]').forEach(initQuote);
