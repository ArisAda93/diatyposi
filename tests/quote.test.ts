import { describe, expect, it } from 'vitest';
import {
  buildQuoteMessage,
  buildSendLinks,
  chatText,
  firstInvalidField,
  formatDateEl,
  isoDate,
  isValidEmail,
  isValidPhone,
  nextQuoteField,
  parsePreselect,
  SEND_CHANNELS,
  sendChannel,
  validateQuote,
  type QuoteData,
} from '../src/lib/quote';
import { contactText } from '../src/i18n/pages/contact';

const errors = contactText.el.errors;
const labels = contactText.el.message;
const TODAY = '2026-11-22';

const valid: QuoteData = {
  name: 'Μαρία Παπαδοπούλου',
  phone: '690 000 0000',
  email: '',
  services: ['kartes-fylladia-entypa'],
  quantity: '',
  date: '',
  message: 'Θα ήθελα 500 επαγγελματικές κάρτες.',
};

const withData = (patch: Partial<QuoteData>): QuoteData => ({ ...valid, ...patch });

describe('validateQuote', () => {
  it('accepts a complete minimal request', () => {
    expect(validateQuote(valid, TODAY)).toEqual({});
  });

  it('requires a name (whitespace does not count)', () => {
    expect(validateQuote(withData({ name: '   ' }), TODAY)).toEqual({ name: errors.nameRequired });
  });

  it('requires a phone', () => {
    expect(validateQuote(withData({ phone: '' }), TODAY)).toEqual({
      phone: errors.phoneRequired,
    });
  });

  it('treats services as optional', () => {
    expect(validateQuote(withData({ services: [] }), TODAY)).toEqual({});
  });

  it('requires a message of at least 10 characters', () => {
    expect(validateQuote(withData({ message: '  ' }), TODAY)).toEqual({
      message: errors.messageRequired,
    });
    expect(validateQuote(withData({ message: 'Κάρτες' }), TODAY)).toEqual({
      message: errors.messageShort,
    });
    expect(validateQuote(withData({ message: 'Κάρτες 500' }), TODAY)).toEqual({});
  });

  it('reports every missing required field at once', () => {
    const empty: QuoteData = {
      name: '',
      phone: '',
      email: '',
      services: [],
      quantity: '',
      date: '',
      message: '',
    };
    expect(Object.keys(validateQuote(empty, TODAY)).sort()).toEqual(
      ['message', 'name', 'phone'].sort(),
    );
  });

  it('treats email as optional but checks it when filled', () => {
    expect(validateQuote(withData({ email: '   ' }), TODAY)).toEqual({});
    expect(validateQuote(withData({ email: 'maria@example.gr' }), TODAY)).toEqual({});
    expect(validateQuote(withData({ email: 'maria@example' }), TODAY)).toEqual({
      email: errors.emailInvalid,
    });
  });

  it('rejects a past date and accepts today or later', () => {
    expect(validateQuote(withData({ date: '2026-11-21' }), TODAY)).toEqual({
      date: errors.datePast,
    });
    expect(validateQuote(withData({ date: TODAY }), TODAY)).toEqual({});
    expect(validateQuote(withData({ date: '2027-01-15' }), TODAY)).toEqual({});
  });

  it('rejects a date that does not exist or is badly written', () => {
    expect(validateQuote(withData({ date: '2027-02-30' }), TODAY)).toEqual({
      date: errors.dateInvalid,
    });
    expect(validateQuote(withData({ date: '15/01/2027' }), TODAY)).toEqual({
      date: errors.dateInvalid,
    });
  });

  it('flags a malformed phone with the format message', () => {
    expect(validateQuote(withData({ phone: '12345' }), TODAY)).toEqual({
      phone: errors.phoneInvalid,
    });
  });
});

describe('phone and email formats', () => {
  it.each([
    '6900000000',
    '690 000 0000',
    '210-000-0000',
    '(210) 000 0000',
    '+30 690 000 0000',
    '+30 (210) 000-0000',
    '00306900000000',
  ])('accepts %s', (phone) => {
    expect(isValidPhone(phone)).toBe(true);
  });

  it.each([
    '690 000 000', // 9 digits
    '+30 690 000 0000 0000', // 16 digits
    '690.000.0000', // dots are not allowed
    '690 000 000a',
    '69+0 000 0000', // + only at the start
    'τηλέφωνο',
  ])('rejects %s', (phone) => {
    expect(isValidPhone(phone)).toBe(false);
  });

  it('checks email addresses', () => {
    expect(isValidEmail('info@diatyposi.example')).toBe(true);
    expect(isValidEmail(' name.surname@mail.co.uk ')).toBe(true);
    expect(isValidEmail('name@')).toBe(false);
    expect(isValidEmail('name@mail')).toBe(false);
    expect(isValidEmail('name @mail.gr')).toBe(false);
    expect(isValidEmail('name@mail..gr')).toBe(false);
  });
});

describe('dates', () => {
  it('gives the local date as yyyy-mm-dd', () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(isoDate(new Date(2026, 10, 22, 23, 59))).toBe('2026-11-22');
  });
  it('formats dates the Greek way', () => {
    expect(formatDateEl('2026-12-05')).toBe('05/12/2026');
  });
});

describe('firstInvalidField', () => {
  it('is null when nothing is wrong', () => {
    expect(firstInvalidField({})).toBeNull();
    expect(firstInvalidField(validateQuote(valid, TODAY))).toBeNull();
  });

  it('picks the earliest field in form order, whatever order the errors come in', () => {
    expect(firstInvalidField({ message: errors.messageShort, phone: errors.phoneRequired })).toBe(
      'phone',
    );
    expect(firstInvalidField({ date: errors.datePast, email: errors.emailInvalid })).toBe('email');
  });

  it('follows validateQuote on a fully empty form', () => {
    const empty: QuoteData = {
      name: '',
      phone: '',
      email: '',
      services: [],
      quantity: '',
      date: '',
      message: '',
    };
    expect(firstInvalidField(validateQuote(empty, TODAY))).toBe('name');
    expect(firstInvalidField(validateQuote({ ...empty, name: 'Μαρία' }, TODAY))).toBe('phone');
  });

  it('treats an empty error string as no error', () => {
    expect(firstInvalidField({ name: '', message: errors.messageRequired })).toBe('message');
  });
});

describe('nextQuoteField', () => {
  it('walks the form in order, from the text fields to the services and on', () => {
    expect(nextQuoteField('name')).toBe('phone');
    expect(nextQuoteField('phone')).toBe('email');
    expect(nextQuoteField('email')).toBe('services');
    expect(nextQuoteField('services')).toBe('quantity');
  });

  it('skips the date', () => {
    expect(nextQuoteField('quantity')).toBe('message');
    expect(nextQuoteField('date')).toBe('message');
  });

  it('ends after the message', () => {
    expect(nextQuoteField('message')).toBeNull();
  });
});

describe('parsePreselect', () => {
  const slugs = ['grafistikos-sxediasmos', 'kartes-fylladia-entypa', 'social-media'];

  it('reads a single service', () => {
    expect(parsePreselect('?ypiresia=social-media', slugs)).toEqual(['social-media']);
  });

  it('reads comma-separated and repeated values, without duplicates', () => {
    expect(
      parsePreselect('?ypiresia=social-media,grafistikos-sxediasmos&ypiresia=social-media', slugs),
    ).toEqual(['social-media', 'grafistikos-sxediasmos']);
    expect(
      parsePreselect('?ypiresia=kartes-fylladia-entypa&ypiresia=grafistikos-sxediasmos', slugs),
    ).toEqual(['kartes-fylladia-entypa', 'grafistikos-sxediasmos']);
  });

  it('ignores unknown slugs, empty values and other parameters', () => {
    expect(parsePreselect('?ypiresia=unknown,social-media,&foo=bar', slugs)).toEqual([
      'social-media',
    ]);
    expect(parsePreselect('?ypiresia=unknown', slugs)).toEqual([]);
    expect(parsePreselect('', slugs)).toEqual([]);
  });
});

describe('buildQuoteMessage', () => {
  const titles = {
    'kartes-fylladia-entypa': 'Επαγγελματικές κάρτες, φυλλάδια & έντυπα',
    'social-media': 'Σχεδιασμός διαφημιστικού υλικού για τα social media',
  };

  it('builds the subject from the name', () => {
    const { subject } = buildQuoteMessage(valid, titles);
    expect(subject).toBe('Αίτημα προσφοράς – Μαρία Παπαδοπούλου');
  });

  it('lists every filled field with a Greek label, services by full title, date as dd/mm/yyyy', () => {
    const { body } = buildQuoteMessage(
      withData({
        email: 'maria@example.gr',
        services: ['kartes-fylladia-entypa', 'social-media'],
        quantity: '500 τεμάχια',
        date: '2026-12-05',
        message: 'Δύο όψεις,\r\nματ χαρτί.',
      }),
      titles,
    );
    const lines = body.split('\n');
    expect(lines[0]).toBe(labels.greeting);
    expect(lines).toContain(`${labels.nameLabel}: Μαρία Παπαδοπούλου`);
    expect(lines).toContain(`${labels.phoneLabel}: 690 000 0000`);
    expect(lines).toContain(`${labels.emailLabel}: maria@example.gr`);
    expect(lines).toContain(`${labels.servicesLabel}:`);
    expect(lines).toContain('– Επαγγελματικές κάρτες, φυλλάδια & έντυπα');
    expect(lines).toContain('– Σχεδιασμός διαφημιστικού υλικού για τα social media');
    expect(lines).toContain(`${labels.quantityLabel}: 500 τεμάχια`);
    expect(lines).toContain(`${labels.dateLabel}: 05/12/2026`);
    expect(body).toContain(`${labels.messageLabel}:\nΔύο όψεις,\nματ χαρτί.`);
    expect(body).not.toContain('\r');
  });

  it('leaves out optional fields that are empty', () => {
    const { body } = buildQuoteMessage(valid, titles);
    expect(body).not.toContain(`${labels.emailLabel}:`);
    expect(body).not.toContain(`${labels.quantityLabel}:`);
    expect(body).not.toContain(`${labels.dateLabel}:`);
  });

  it('falls back to the slug for an unknown service', () => {
    const { body } = buildQuoteMessage(withData({ services: ['unknown'] }), titles);
    expect(body).toContain('– unknown');
  });
});

describe('buildSendLinks', () => {
  const contact = {
    email: 'info@diatyposi.example',
    viber: '306900000000',
    whatsapp: '+30 690 000 0000',
  };
  const message = buildQuoteMessage(valid, { 'kartes-fylladia-entypa': 'Κάρτες' });
  const links = buildSendLinks(contact, message);
  const text = chatText(message);

  it('puts subject and body (with CRLF line breaks) in the mailto link', () => {
    expect(links.email).toBe(
      `mailto:info@diatyposi.example?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body.replace(/\n/g, '\r\n'))}`,
    );
    expect(links.email).toContain('%0D%0A');
    expect(links.email).not.toMatch(/[ \n]/);
  });

  it('prefills WhatsApp through wa.me with ?text=', () => {
    expect(links.whatsapp).toBe(`https://wa.me/306900000000?text=${encodeURIComponent(text)}`);
    expect(new URL(links.whatsapp).searchParams.get('text')).toBe(text);
  });

  it('prefills Viber with draft= and an encoded + in the number', () => {
    expect(links.viber).toBe(
      `viber://chat?number=%2B306900000000&draft=${encodeURIComponent(text)}`,
    );
  });

  it('starts the chat text with the subject', () => {
    expect(text.startsWith(`${message.subject}\n\n${labels.greeting}`)).toBe(true);
  });
});

describe('sendChannel', () => {
  it('lists the apps in the order the form offers them', () => {
    expect(SEND_CHANNELS).toEqual(['email', 'viber', 'whatsapp']);
  });

  it.each(['email', 'viber', 'whatsapp'] as const)('opens %s for its own button', (channel) => {
    expect(sendChannel(channel)).toBe(channel);
  });

  it.each(['', null, undefined, 'sms'])('falls back to email for %j', (value) => {
    expect(sendChannel(value)).toBe('email');
  });
});
