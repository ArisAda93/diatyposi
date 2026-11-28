import type { APIRoute } from 'astro';
import { site as siteData } from '~/data/site';
import { buildSecurityTxt } from '~/lib/security-txt';

export const GET: APIRoute = ({ site }) =>
  new Response(buildSecurityTxt({ email: siteData.contact.email, site: site!, now: new Date() }), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
